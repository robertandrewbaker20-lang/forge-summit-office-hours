import { Resend } from "resend";
import { VENUE_ROOM } from "./venue";
import { isValidEmail } from "./emails";

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
  return (process.env.RESEND_API_KEY || "").trim();
}

function notifyEmail(): string {
  return (process.env.NOTIFY_EMAIL || DEFAULT_NOTIFY).trim();
}

function fromEmail(): string {
  return (process.env.FROM_EMAIL || DEFAULT_FROM).trim();
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

export type MailKind = "attendee" | "host" | "admin" | "test";

export type MailResult = {
  kind: MailKind;
  to: string[];
  status: "sent" | "failed" | "skipped";
  id?: string;
  error?: string;
};

export type SendFn = (input: {
  from: string;
  to: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}) => Promise<{ id?: string }>;

export type MailDeps = {
  send?: SendFn;
  record?: (slotId: string | null, result: MailResult) => Promise<void>;
};

function resendSender(apiKey: string): SendFn {
  const resend = new Resend(apiKey);
  return async (input) => {
    const { data, error } = await resend.emails.send({
      from: input.from,
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    if (error) throw new Error(error.message || "Resend send failed");
    return { id: data?.id };
  };
}

async function deliver(
  send: SendFn | null,
  kind: MailKind,
  to: string[],
  message: { subject: string; text: string; html: string; replyTo?: string },
): Promise<MailResult> {
  const recipients = to.map((t) => t.trim().toLowerCase()).filter(isValidEmail);
  if (!recipients.length) {
    return { kind, to: [], status: "skipped", error: "no valid recipients" };
  }
  if (!send) {
    return { kind, to: recipients, status: "skipped", error: "RESEND_API_KEY is not set" };
  }
  try {
    const { id } = await send({ from: fromEmail(), to: recipients, ...message });
    return { kind, to: recipients, status: "sent", id };
  } catch (err) {
    return {
      kind,
      to: recipients,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function adminCopyEmail(): string {
  return notifyEmail();
}

/**
 * Sends attendee confirmation, host/agency notification and optional admin
 * copy. Never throws: a mail problem must never undo or fail a booking.
 */
export async function sendBookingEmails(
  booking: BookingMailPayload,
  opts: { slotId?: string; hostEmails?: string[]; deps?: MailDeps } = {},
): Promise<MailResult[]> {
  const results: MailResult[] = [];
  try {
    const apiKey = resendApiKey();
    const send = opts.deps?.send ?? (apiKey ? resendSender(apiKey) : null);
    const lines = bookingLines(booking).join("\n");
    const room = field(booking.room, VENUE_ROOM);
    const hostEmails = opts.hostEmails ?? [];

    results.push(
      await deliver(send, "attendee", [booking.email], {
        subject: `Office hours confirmed — ${field(booking.agency)}, ${field(booking.day)} ${field(booking.time)}`,
        text: `You are booked.\n\n${lines}\n\nMeetings are in ${room}. Each group has a table sign.`,
        html: bookingHtml(booking, "You are booked. Give your name at the table a couple of minutes early."),
      }),
    );

    const attendeeReplyTo = isValidEmail(booking.email) ? booking.email.trim() : undefined;
    results.push(
      await deliver(send, "host", hostEmails, {
        subject: `New office hours booking with ${field(booking.agency)} — ${field(booking.day)} ${field(booking.time)}`,
        text: `Someone booked time with ${field(booking.agency)} at Forge Summit office hours. Reply to this email to reach them.\n\n${lines}`,
        html: bookingHtml(
          booking,
          `Someone booked time with ${field(booking.agency)} at Forge Summit office hours. Reply to this email to reach them.`,
        ),
        replyTo: attendeeReplyTo,
      }),
    );

    const admin = notifyEmail();
    const adminTo = admin && !hostEmails.includes(admin.toLowerCase()) ? [admin] : [];
    if (adminTo.length) {
      results.push(
        await deliver(send, "admin", adminTo, {
          subject: `New office hours booking — ${field(booking.name)} / ${field(booking.agency)}`,
          text: `A slot was booked.\nHost notified: ${hostEmails.join(", ") || "(no notification email on file)"}\n\n${lines}`,
          html: bookingHtml(
            booking,
            `A new office hours slot was booked. Host notified: ${hostEmails.join(", ") || "(no notification email on file)"}.`,
          ),
          replyTo: attendeeReplyTo,
        }),
      );
    }
  } catch (err) {
    console.error("Booking mail failed; booking was not rolled back.", err);
  }

  for (const r of results) {
    const line = { kind: r.kind, to: r.to, status: r.status, id: r.id, error: r.error, slotId: opts.slotId };
    if (r.status === "failed") console.error("Booking mail failed; booking still succeeded.", line);
    else if (r.status === "skipped") console.warn("Booking mail skipped.", line);
    else console.log("Booking mail sent.", line);
    try {
      await opts.deps?.record?.(opts.slotId ?? null, r);
    } catch (err) {
      console.error("mail record failed", err);
    }
  }
  return results;
}

/** Admin "send test email" helper. */
export async function sendTestEmail(to: string[], deps?: MailDeps): Promise<MailResult> {
  const apiKey = resendApiKey();
  const send = deps?.send ?? (apiKey ? resendSender(apiKey) : null);
  const result = await deliver(send, "test", to, {
    subject: "Forge Summit office hours — test notification",
    text: "This is a test from the office hours admin page. If you got it, booking notifications will reach this address.",
    html: `<p>This is a test from the office hours admin page. If you got it, booking notifications will reach this address.</p>`,
  });
  try {
    await deps?.record?.(null, result);
  } catch (err) {
    console.error("mail record failed", err);
  }
  return result;
}
