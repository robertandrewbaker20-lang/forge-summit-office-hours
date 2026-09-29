import type { PoolClient } from "@neondatabase/serverless";
import { getPool, getSql } from "./db";
import { formatEmailList, parseEmailList } from "./emails";
import { generateGridForAgency, releaseCovered, type Queryable } from "./regrid";
import type { HostType } from "./types";

export type AdminAgency = {
  id: number;
  name: string;
  type: HostType;
  blurb: string;
  location: string;
  website: string;
  repName: string;
  notifyEmails: string[];
  logoUrl: string;
  sortOrder: number | null;
  active: boolean;
  booked: number;
  open: number;
  slots: number;
};

export type AdminBooking = {
  id: string;
  agencyId: number;
  agencyName: string;
  startAt: string;
  dayLabel: string;
  timeLabel: string;
  attendeeName: string;
  attendeeEmail: string;
  organization: string;
  topic: string;
  confirmation: string;
  bookedAt: string | null;
};

export type MailLogRow = {
  id: number;
  createdAt: string;
  kind: string;
  slotId: string | null;
  recipients: string;
  status: string;
  providerId: string | null;
  error: string | null;
};

export type AgencyInput = {
  name: string;
  type: HostType;
  repName: string;
  notifyEmails: string;
  blurb: string;
  location: string;
  website: string;
  logoUrl: string;
  sortOrder: number | null;
  active: boolean;
};

export class ValidationError extends Error {}

const LIMITS = { name: 80, repName: 120, blurb: 1200, location: 120, website: 200, logoUrl: 500 };

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return v == null ? "" : String(v);
}

/** Validate + normalize admin input. Throws ValidationError with a human message. */
export function normalizeAgencyInput(raw: Partial<Record<keyof AgencyInput, unknown>>): AgencyInput {
  const text = (v: unknown) => String(v ?? "").trim();
  const name = text(raw.name).replace(/\s+/g, " ");
  if (!name) throw new ValidationError("Name is required.");
  if (name.length > LIMITS.name) throw new ValidationError(`Name must be ${LIMITS.name} characters or fewer.`);
  const typeRaw = text(raw.type);
  if (typeRaw !== "Partner" && typeRaw !== "Cohort") {
    throw new ValidationError("Group must be Support agency (Partner) or Startup (Cohort).");
  }
  const { emails, invalid } = parseEmailList(text(raw.notifyEmails));
  if (invalid.length) throw new ValidationError(`Not a valid email: ${invalid.slice(0, 3).join(", ")}`);
  if (emails.length > 10) throw new ValidationError("Use at most 10 notification emails.");
  const repName = text(raw.repName);
  const blurb = text(raw.blurb);
  const location = text(raw.location);
  const website = text(raw.website).replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const logoUrl = text(raw.logoUrl);
  if (repName.length > LIMITS.repName) throw new ValidationError("Contact name is too long.");
  if (blurb.length > LIMITS.blurb) throw new ValidationError("Description is too long.");
  if (location.length > LIMITS.location) throw new ValidationError("Location is too long.");
  if (website.length > LIMITS.website || /\s/.test(website)) throw new ValidationError("Website looks wrong.");
  if (logoUrl && !/^(\/[\w\-./]+|https:\/\/\S+)$/.test(logoUrl)) {
    throw new ValidationError("Logo must be a /path under public or an https:// URL.");
  }
  if (logoUrl.length > LIMITS.logoUrl) throw new ValidationError("Logo URL is too long.");
  const sortRaw = text(raw.sortOrder);
  let sortOrder: number | null = null;
  if (sortRaw) {
    sortOrder = Number(sortRaw);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) {
      throw new ValidationError("Display order must be a whole number (0–100000).");
    }
  }
  const activeRaw = raw.active;
  const active = activeRaw === true || activeRaw === "on" || activeRaw === "true";
  return {
    name,
    type: typeRaw,
    repName,
    notifyEmails: formatEmailList(emails),
    blurb,
    location,
    website,
    logoUrl,
    sortOrder,
    active,
  };
}

async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "23505");
}

export async function listAdminAgencies(): Promise<AdminAgency[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT a.*,
      COALESCE(SUM(CASE WHEN s.status = 'Booked' THEN 1 ELSE 0 END), 0)::int AS booked,
      COALESCE(SUM(CASE WHEN s.status = 'Open' THEN 1 ELSE 0 END), 0)::int AS open,
      COUNT(s.id)::int AS slots
    FROM agencies a
    LEFT JOIN slots s ON s.agency_id = a.id
    GROUP BY a.id
    ORDER BY a.active DESC, a.type DESC, COALESCE(a.sort_order, a.id), a.id
  `) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    type: /cohort/i.test(String(r.type)) ? "Cohort" : "Partner",
    blurb: String(r.blurb || ""),
    location: String(r.location || ""),
    website: String(r.website || ""),
    repName: String(r.rep_name || ""),
    notifyEmails: parseEmailList(String(r.rep_emails || "")).emails,
    logoUrl: String(r.logo_url || ""),
    sortOrder: r.sort_order == null ? null : Number(r.sort_order),
    active: Boolean(r.active),
    booked: Number(r.booked),
    open: Number(r.open),
    slots: Number(r.slots),
  }));
}

/** Build the Open slot grid for one agency (current Slot Minutes, default 15). */
export async function generateSlotsForAgency(
  client: PoolClient,
  agencyId: number,
  _agencyName?: string,
): Promise<number> {
  void _agencyName;
  return generateGridForAgency(client as unknown as Queryable, agencyId);
}

export async function createAgency(input: AgencyInput): Promise<{ id: number; slots: number }> {
  try {
    return await tx(async (client) => {
      const res = await client.query<{ id: number }>(
        `INSERT INTO agencies (name, type, blurb, location, website, rep_name, rep_emails, calendar_id, active, logo_url, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '', $8, $9, $10)
         RETURNING id`,
        [input.name, input.type, input.blurb, input.location, input.website, input.repName, input.notifyEmails, input.active, input.logoUrl, input.sortOrder],
      );
      const id = Number(res.rows[0].id);
      const slots = await generateSlotsForAgency(client, id, input.name);
      return { id, slots };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ValidationError(`An agency named "${input.name}" already exists.`);
    throw err;
  }
}

export async function updateAgencyAdmin(id: number, input: AgencyInput): Promise<void> {
  try {
    await tx(async (client) => {
      const res = await client.query(
        `UPDATE agencies
         SET name = $2, type = $3, blurb = $4, location = $5, website = $6,
             rep_name = $7, rep_emails = $8, active = $9, logo_url = $10, sort_order = $11, updated_at = now()
         WHERE id = $1`,
        [id, input.name, input.type, input.blurb, input.location, input.website, input.repName, input.notifyEmails, input.active, input.logoUrl, input.sortOrder],
      );
      if (res.rowCount !== 1) throw new ValidationError("Agency not found.");
      // Keep the denormalized name on slots in sync (bookings stay attached by id).
      await client.query(`UPDATE slots SET agency_name = $2 WHERE agency_id = $1 AND agency_name <> $2`, [id, input.name]);
      const count = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM slots WHERE agency_id = $1`, [id]);
      if (Number(count.rows[0]?.n || 0) === 0) await generateSlotsForAgency(client, id, input.name);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ValidationError(`Another agency is already named "${input.name}".`);
    throw err;
  }
}

export async function setAgencyActive(id: number, active: boolean): Promise<void> {
  const sql = getSql();
  const rows = (await sql`UPDATE agencies SET active = ${active}, updated_at = now() WHERE id = ${id} RETURNING id`) as unknown[];
  if (!rows.length) throw new ValidationError("Agency not found.");
}

/** Hard delete only when the agency has no bookings. Otherwise deactivate. */
export async function deleteAgency(id: number): Promise<string> {
  return tx(async (client) => {
    const ag = await client.query<{ name: string }>(`SELECT name FROM agencies WHERE id = $1 FOR UPDATE`, [id]);
    if (!ag.rows[0]) throw new ValidationError("Agency not found.");
    const booked = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM slots WHERE agency_id = $1 AND status = 'Booked'`,
      [id],
    );
    if (Number(booked.rows[0]?.n || 0) > 0) {
      throw new ValidationError("This agency has bookings. Deactivate it instead, or cancel the bookings first.");
    }
    await client.query(`DELETE FROM slots WHERE agency_id = $1`, [id]);
    await client.query(`DELETE FROM agencies WHERE id = $1`, [id]);
    return ag.rows[0].name;
  });
}

export async function listAdminBookings(): Promise<AdminBooking[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT s.*, COALESCE(a.name, s.agency_name) AS host_name
    FROM slots s LEFT JOIN agencies a ON a.id = s.agency_id
    WHERE s.status = 'Booked'
    ORDER BY s.start_at, host_name
  `) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    agencyId: Number(r.agency_id),
    agencyName: String(r.host_name),
    startAt: iso(r.start_at),
    dayLabel: String(r.day_label || ""),
    timeLabel: String(r.time_label || ""),
    attendeeName: String(r.attendee_name || ""),
    attendeeEmail: String(r.attendee_email || ""),
    organization: String(r.organization || ""),
    topic: String(r.topic || ""),
    confirmation: String(r.confirmation || ""),
    bookedAt: r.booked_at ? iso(r.booked_at) : null,
  }));
}

/** Cancel a booking: the slot goes back to Open and attendee data is cleared. */
export async function cancelBooking(slotId: string): Promise<boolean> {
  return tx(async (client) => {
    const res = await client.query(
      `UPDATE slots
       SET status = 'Open', attendee_name = NULL, attendee_email = NULL,
           organization = NULL, topic = NULL, booked_at = NULL, confirmation = NULL
       WHERE id = $1 AND status = 'Booked'
       RETURNING id`,
      [slotId],
    );
    if (res.rows.length !== 1) return false;
    // A legacy 30-minute booking frees its second 15-minute slot too.
    await releaseCovered(client as unknown as Queryable, slotId);
    return true;
  });
}

/** Notification recipients for the host of a booked slot. */
export async function notifyEmailsForSlot(slotId: string): Promise<{ agency: string; emails: string[] }> {
  const sql = getSql();
  const rows = (await sql`
    SELECT a.name, a.rep_emails FROM slots s JOIN agencies a ON a.id = s.agency_id WHERE s.id = ${slotId}
  `) as { name: string; rep_emails: string }[];
  if (!rows[0]) return { agency: "", emails: [] };
  return { agency: rows[0].name, emails: parseEmailList(rows[0].rep_emails).emails };
}

export async function recordMail(entry: {
  kind: string;
  slotId?: string | null;
  recipients: string[];
  status: "sent" | "failed" | "skipped";
  providerId?: string | null;
  error?: string | null;
}): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO mail_log (kind, slot_id, recipients, status, provider_id, error)
      VALUES (${entry.kind}, ${entry.slotId ?? null}, ${entry.recipients.join(", ")}, ${entry.status},
              ${entry.providerId ?? null}, ${entry.error ? entry.error.slice(0, 500) : null})
    `;
  } catch (err) {
    console.error("mail_log insert failed", err);
  }
}

export async function listMailLog(limit = 40): Promise<MailLogRow[]> {
  const sql = getSql();
  const rows = (await sql`SELECT * FROM mail_log ORDER BY created_at DESC LIMIT ${limit}`) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    createdAt: iso(r.created_at),
    kind: String(r.kind),
    slotId: r.slot_id ? String(r.slot_id) : null,
    recipients: String(r.recipients || ""),
    status: String(r.status),
    providerId: r.provider_id ? String(r.provider_id) : null,
    error: r.error ? String(r.error) : null,
  }));
}
