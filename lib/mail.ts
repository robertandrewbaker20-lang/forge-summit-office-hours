import { Resend } from "resend";
import { VENUE_ROOM } from "./venue";
import {
  previewFromEmail,
  previewNotifyEmail,
  previewResendApiKey,
} from "./preview-env";

export type BookingMailPayload = {
  name: string;
  email: string;
  org: string;
  topic: string;
  agency: string;
  day: string;
  time: string;
  room: string;
  confirmation: string;
};

const DEFAULT_NOTIFY = "robertandrewbaker20@gmail.com";
const DEFAULT_FROM = "Forge Summit Office Hours <beth.t@example.com>";

function resendApiKey(): string {
  return (process.env.RESEND_API_KEY || previewResendApiKey).trim();
}

function notifyEmail(): string {
  return (process.env.NOTIFY_EMAIL || previewNotifyEmail || DEFAULT_NOTIFY).trim();
}

function fromEmail(): string {
  return (process.env.FROM_EMAIL || previewFromEmail || DEFAULT_FROM).trim();
}

function field(value: string, fallback = "—"): string {
  const trimmed = value.trim();
  return trimmed || fallback;
}

function bookingLines(booking: BookingMailPayload): string[] {
  const room = field(booking.room, VENUE_ROOM);
  return [
    `Host: ${field(booking.agency)}`,
    `When: ${field(booking.day)}, ${field(booking.time)}`,
    `Where: ${room}`,
    `Confirmation: ${field(booking.confirmation)}`,
    `Name: ${field(booking.name)}`,
    `Email: ${field(booking.email)}`,
    `Organization: ${field(booking.org)}`,
    `Topic: ${field(booking.topic)}`,
  ];
}

function bookingHtml(booking: BookingMailPayload, intro: string): string {
  const rows = bookingLines(booking)
    .map((line) => {
      const [label, ...rest] = line.split(": ");
      return `<tr><td style="padding:6px 16px 6px 0;color:#64748b;vertical-align:top;">${label}</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(rest.join(": "))}</td></tr>`;
    })
    .join("");
  return `<!doctype html>
<html><body style="margin:0;background:#f3f5f8;color:#0a1220;font-family:Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:24px auto;padding:0 16px;">
    <p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
    <table style="width:100%;border-collapse:collapse;background:#fff;padding:16px;border:1px solid #dce2e9;">${rows}</table>
    <p style="margin:16px 0 0;color:#64748b;font-size:13px;">Meetings are in ${escapeHtml(field(booking.room, VENUE_ROOM))}. Each group has a table sign.</p>
  </div>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendOne(
  resend: Resend,
  input: { to: string; subject: string; text: string; html: string },
): Promise<void> {
  const { error } = await resend.emails.send({
    from: fromEmail(),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  if (error) {
    throw new Error(error.message || "Resend send failed");
  }
}

async function sendBookingEmailsInner(booking: BookingMailPayload): Promise<void> {
  const apiKey = resendApiKey();
  if (!apiKey) {
    console.warn(
      "Booking mail skipped: RESEND_API_KEY is not set. Booking still succeeded.",
    );
    return;
  }

  const resend = new Resend(apiKey);
  const lines = bookingLines(booking).join("\n");
  const room = field(booking.room, VENUE_ROOM);

  const attendeeTo = booking.email.trim();
  if (attendeeTo) {
    try {
      await sendOne(resend, {
        to: attendeeTo,
        subject: `Office hours confirmed — ${field(booking.agency)}, ${field(booking.day)} ${field(booking.time)}`,
        text: `You are booked.\n\n${lines}\n\nMeetings are in ${room}. Each group has a table sign.`,
        html: bookingHtml(
          booking,
          "You are booked. Give your name at the table a couple of minutes early.",
        ),
      });
    } catch (err) {
      console.error(
        "Booking confirmation mail failed; booking still succeeded.",
        err,
      );
    }
  } else {
    console.warn(
      "Booking confirmation mail skipped: attendee email is empty. Booking still succeeded.",
    );
  }

  const notifyTo = notifyEmail();
  if (!notifyTo) {
    console.warn(
      "Booking notify mail skipped: NOTIFY_EMAIL is not set. Booking still succeeded.",
    );
    return;
  }

  try {
    await sendOne(resend, {
      to: notifyTo,
      subject: `New office hours booking — ${field(booking.name)} / ${field(booking.agency)}`,
      text: `A slot was booked.\n\n${lines}`,
      html: bookingHtml(booking, "A new office hours slot was booked."),
    });
  } catch (err) {
    console.error("Booking notify mail failed; booking still succeeded.", err);
  }
}

/** Never throws. Missing keys or provider errors skip mail; the book stands. */
export async function sendBookingEmails(
  booking: BookingMailPayload,
): Promise<void> {
  try {
    await sendBookingEmailsInner(booking);
  } catch (err) {
    console.error(
      "Booking mail failed; booking was not rolled back.",
      err,
    );
  }
}
