"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  ADMIN_COOKIE,
  SESSION_TTL_MS,
  adminPasswordConfigured,
  checkPassword,
  clearLoginThrottle,
  createSessionToken,
  loginThrottled,
} from "@/lib/adminSession";
import {
  ValidationError,
  cancelBooking,
  createAgency,
  deleteAgency,
  normalizeAgencyInput,
  recordMail,
  setAgencyActive,
  updateAgencyAdmin,
} from "@/lib/agencies";
import { updateSetting } from "@/lib/booking";
import { parseEmailList } from "@/lib/emails";
import { adminCopyEmail, sendTestEmail } from "@/lib/mail";
import { ensureSchema } from "@/lib/schema";
import { isAdmin } from "./session";

function back(kind: "ok" | "err", message: string, anchor = ""): never {
  redirect(`/admin?${kind}=${encodeURIComponent(message.slice(0, 300))}${anchor}`);
}

async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin?err=" + encodeURIComponent("Please sign in again."));
  await ensureSchema();
}

function agencyFields(form: FormData) {
  return {
    name: form.get("name"),
    type: form.get("type"),
    repName: form.get("repName"),
    notifyEmails: form.get("notifyEmails"),
    blurb: form.get("blurb"),
    location: form.get("location"),
    website: form.get("website"),
    logoUrl: form.get("logoUrl"),
    active: form.get("active"),
  };
}

function idFrom(form: FormData): number {
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Missing agency id.");
  return id;
}

async function run(fn: () => Promise<string>, anchor = ""): Promise<never> {
  let message: string;
  try {
    message = await fn();
  } catch (err) {
    if (err instanceof ValidationError) back("err", err.message, anchor);
    console.error("Admin action failed", err);
    back("err", "Something went wrong saving that. Try again.", anchor);
  }
  revalidatePath("/admin");
  revalidatePath("/");
  back("ok", message, anchor);
}

export async function loginAction(form: FormData): Promise<void> {
  if (!adminPasswordConfigured()) back("err", "ADMIN_PASSWORD is not configured on the server.");
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "").split(",")[0]?.trim() || "unknown";
  if (loginThrottled(ip)) back("err", "Too many attempts. Wait 15 minutes.");
  const password = String(form.get("password") || "");
  if (!checkPassword(password)) {
    await new Promise((r) => setTimeout(r, 600));
    back("err", "Wrong password.");
  }
  clearLoginThrottle(ip);
  const store = await cookies();
  store.set(ADMIN_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  redirect("/admin");
}

export async function createAgencyAction(form: FormData): Promise<void> {
  await requireAdmin();
  await run(async () => {
    const input = normalizeAgencyInput(agencyFields(form));
    const { slots } = await createAgency(input);
    return `Added ${input.name} with ${slots} open slots${input.active ? "" : " (inactive — not shown to attendees yet)"}.`;
  }, "#agencies");
}

export async function updateAgencyAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(form.get("id"));
  await run(async () => {
    const input = normalizeAgencyInput(agencyFields(form));
    await updateAgencyAdmin(idFrom(form), input);
    return `Saved ${input.name}.`;
  }, `#agency-${id}`);
}

export async function toggleAgencyAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(form.get("id"));
  const active = form.get("active") === "true";
  await run(async () => {
    await setAgencyActive(idFrom(form), active);
    return active ? "Activated — attendees can book it now." : "Deactivated — hidden from attendees. Existing bookings are kept.";
  }, `#agency-${id}`);
}

export async function deleteAgencyAction(form: FormData): Promise<void> {
  await requireAdmin();
  await run(async () => {
    const name = await deleteAgency(idFrom(form));
    return `Deleted ${name}.`;
  }, "#agencies");
}

export async function cancelBookingAction(form: FormData): Promise<void> {
  await requireAdmin();
  await run(async () => {
    const slotId = String(form.get("slotId") || "").trim();
    if (!slotId) throw new ValidationError("Missing slot.");
    const ok = await cancelBooking(slotId);
    if (!ok) throw new ValidationError("That booking was already cancelled.");
    return "Booking cancelled. The slot is open again. (No email is sent to the attendee.)";
  }, "#bookings");
}

export async function setBookingOpenAction(form: FormData): Promise<void> {
  await requireAdmin();
  const open = form.get("open") === "true";
  await run(async () => {
    await updateSetting("Booking Open", open ? "true" : "false");
    return open ? "Booking is open." : "Booking is closed. Attendees see a closed message.";
  });
}

export async function sendTestEmailAction(form: FormData): Promise<void> {
  await requireAdmin();
  await run(async () => {
    const raw = String(form.get("to") || "").trim() || adminCopyEmail();
    const { emails, invalid } = parseEmailList(raw);
    if (invalid.length || !emails.length) throw new ValidationError("Enter a valid email for the test.");
    if (emails.length > 3) throw new ValidationError("Test up to 3 addresses at a time.");
    const result = await sendTestEmail(emails, {
      record: (_slot, r) =>
        recordMail({ kind: r.kind, recipients: r.to, status: r.status, providerId: r.id, error: r.error }),
    });
    if (result.status === "sent") return `Test email accepted by Resend for ${emails.join(", ")} (id ${result.id}).`;
    throw new ValidationError(`Test email ${result.status}: ${result.error || "unknown error"}`);
  }, "#mail");
}
