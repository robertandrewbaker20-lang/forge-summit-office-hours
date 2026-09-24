import { getPool, getSql } from "./db";
import type { Pool } from "@neondatabase/serverless";
import { logoFor } from "./logos";
import type {
  Agency,
  Availability,
  Board,
  BookSlotInput,
  BookSlotResult,
  EventInfo,
  HostType,
  OpsBooking,
  Slot,
  SlotStatus,
} from "./types";

export const TZ = "America/Chicago";

const CONF_CHARS = "ACDEFHJKLMNPRTVWXY3479";
const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/;

type SettingRow = { key: string; value: string };
type AgencyRow = {
  id: number;
  name: string;
  type: string;
  blurb: string;
  location: string;
  website: string;
  rep_name: string;
  rep_emails: string;
  calendar_id: string;
  active: boolean;
};
type SlotRow = {
  id: string;
  agency_id: number;
  agency_name: string;
  start_at: string | Date;
  end_at: string | Date;
  time_label: string;
  day_label: string;
  status: string;
  attendee_name: string | null;
  attendee_email: string | null;
  organization: string | null;
  topic: string | null;
  booked_at: string | Date | null;
  confirmation: string | null;
  calendar_event_id: string | null;
};

function asHostType(value: string): HostType {
  return /cohort/i.test(value) ? "Cohort" : "Partner";
}

function asStatus(value: string): SlotStatus {
  if (value === "Booked" || value === "Blocked") return value;
  return "Open";
}

function iso(value: string | Date | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapAgency(row: AgencyRow): Agency {
  return {
    id: row.id,
    name: row.name,
    type: asHostType(row.type),
    blurb: row.blurb,
    location: row.location,
    website: String(row.website || "").replace(/^https?:\/\//i, ""),
    repName: row.rep_name,
    repEmails: row.rep_emails,
    calendarId: row.calendar_id,
    active: row.active,
  };
}

function mapSlot(row: SlotRow): Slot {
  return {
    id: row.id,
    agencyId: row.agency_id,
    agencyName: row.agency_name,
    startAt: iso(row.start_at) || "",
    endAt: iso(row.end_at) || "",
    timeLabel: row.time_label,
    dayLabel: row.day_label,
    status: asStatus(row.status),
    attendeeName: row.attendee_name,
    attendeeEmail: row.attendee_email,
    organization: row.organization,
    topic: row.topic,
    bookedAt: iso(row.booked_at),
    confirmation: row.confirmation,
    calendarEventId: row.calendar_event_id,
  };
}

export async function getSettingsMap(): Promise<Record<string, string>> {
  const sql = getSql();
  const rows = (await sql`SELECT key, value FROM settings`) as SettingRow[];
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export function eventFromSettings(cfg: Record<string, string>): EventInfo {
  return {
    name: cfg["Event Name"] || "Forge Summit",
    tagline: cfg["Tagline"] || "",
    location: cfg["Location"] || "",
    room: cfg["Room"] || "",
    logo: cfg["Logo URL"] || "",
  };
}

export function bookingIsOpen(cfg: Record<string, string>): boolean {
  return String(cfg["Booking Open"]).toLowerCase() !== "false";
}

export async function listAgencies(opts?: {
  activeOnly?: boolean;
}): Promise<Agency[]> {
  const sql = getSql();
  const rows = opts?.activeOnly
    ? ((await sql`SELECT * FROM agencies WHERE active = true ORDER BY id`) as AgencyRow[])
    : ((await sql`SELECT * FROM agencies ORDER BY id`) as AgencyRow[]);
  return rows.map(mapAgency);
}

export async function getAvailability(): Promise<Availability> {
  const sql = getSql();
  const cfg = await getSettingsMap();
  const agencies = await listAgencies({ activeOnly: true });
  const activeNames = new Set(agencies.map((ag) => ag.name));
  const slotRows = (await sql`
    SELECT id, agency_name, time_label, day_label, status
    FROM slots
    WHERE status <> 'Blocked'
    ORDER BY start_at, agency_name
  `) as {
    id: string;
    agency_name: string;
    time_label: string;
    day_label: string;
    status: string;
  }[];

  const byAgency: Record<
    string,
    { open: number; slots: Availability["agencies"][number]["slots"] }
  > = {};
  const dayOrder: string[] = [];
  let openTotal = 0;

  for (const row of slotRows) {
    if (!activeNames.has(row.agency_name)) continue;
    if (!dayOrder.includes(row.day_label)) dayOrder.push(row.day_label);
    if (!byAgency[row.agency_name]) {
      byAgency[row.agency_name] = { open: 0, slots: [] };
    }
    const isOpen = row.status === "Open";
    if (isOpen) {
      byAgency[row.agency_name].open += 1;
      openTotal += 1;
    }
    byAgency[row.agency_name].slots.push({
      id: row.id,
      day: row.day_label,
      time: row.time_label,
      open: isOpen,
    });
  }

  return {
    open: bookingIsOpen(cfg),
    total: openTotal,
    days: dayOrder,
    agencies: agencies.map((ag) => {
      const data = byAgency[ag.name] || { open: 0, slots: [] };
      return {
        name: ag.name,
        type: ag.type,
        blurb: ag.blurb,
        location: ag.location,
        website: ag.website,
        rep: ag.repName,
        logo: logoFor(ag.name),
        open: data.open,
        slots: data.slots,
      };
    }),
    event: eventFromSettings(cfg),
  };
}

function confirmationCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CONF_CHARS.charAt(Math.floor(Math.random() * CONF_CHARS.length));
  }
  return out;
}

const ORG_MAX = 120;

export async function bookSlot(
  payload: BookSlotInput,
  deps?: { pool?: Pool },
): Promise<BookSlotResult> {
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const org = String(payload.org || "").trim().slice(0, ORG_MAX);
  const topic = String(payload.topic || "").trim().slice(0, 500);
  const slotId = String(payload.slotId || "").trim();

  if (!slotId || !name || name.length > 80 || !EMAIL_RE.test(email)) {
    return { ok: false, code: "INVALID" };
  }

  const pool = deps?.pool ?? getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [email]);

    const cfgRes = await client.query<{ key: string; value: string }>(
      "SELECT key, value FROM settings",
    );
    const cfg: Record<string, string> = {};
    for (const row of cfgRes.rows) cfg[row.key] = row.value;

    if (!bookingIsOpen(cfg)) {
      await client.query("ROLLBACK");
      return { ok: false, code: "CLOSED" };
    }

    const slotRes = await client.query<{
      id: string;
      status: string;
      start_at: string | Date;
      agency_id: number;
      agency_name: string;
      day_label: string;
      time_label: string;
      agency_active: boolean | null;
    }>(
      `SELECT s.id, s.status, s.start_at, s.agency_id, s.agency_name,
              s.day_label, s.time_label, COALESCE(a.active, a2.active) AS agency_active
       FROM slots s
       LEFT JOIN agencies a ON a.id = s.agency_id
       LEFT JOIN agencies a2 ON a2.name = s.agency_name
       WHERE s.id = $1
       LIMIT 1`,
      [slotId],
    );
    const slot = slotRes.rows[0];
    if (!slot) {
      await client.query("ROLLBACK");
      return { ok: false, code: "TAKEN" };
    }
    if (slot.agency_active === false) {
      await client.query("ROLLBACK");
      return { ok: false, code: "INACTIVE" };
    }
    const startAt = new Date(slot.start_at);
    if (Number.isNaN(startAt.getTime()) || startAt.getTime() <= Date.now()) {
      await client.query("ROLLBACK");
      return { ok: false, code: "PAST" };
    }
    if (slot.status !== "Open") {
      await client.query("ROLLBACK");
      return { ok: false, code: "TAKEN" };
    }

    const cap = Number(cfg["Max Bookings Per Email"] || 2);
    const mineRes = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM slots
       WHERE status = 'Booked' AND lower(attendee_email) = $1`,
      [email],
    );
    const mine = Number(mineRes.rows[0]?.n || 0);
    if (cap > 0 && mine >= cap) {
      await client.query("ROLLBACK");
      return { ok: false, code: "LIMIT", limit: cap };
    }

    const conf = confirmationCode();
    const updated = await client.query<{
      agency_name: string;
      day_label: string;
      time_label: string;
      confirmation: string;
    }>(
      `UPDATE slots
       SET status = 'Booked',
           attendee_name = $2,
           attendee_email = $3,
           organization = $4,
           topic = $5,
           booked_at = now(),
           confirmation = $6
       WHERE id = $1 AND status = 'Open'
       RETURNING agency_name, day_label, time_label, confirmation`,
      [slotId, name, email, org, topic, conf],
    );

    if (updated.rowCount !== 1) {
      await client.query("ROLLBACK");
      return { ok: false, code: "TAKEN" };
    }

    await client.query("COMMIT");
    const row = updated.rows[0];
    return {
      ok: true,
      confirmation: row.confirmation,
      agency: row.agency_name,
      day: row.day_label,
      time: row.time_label,
      room: cfg["Room"] || "",
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error("bookSlot failed", err);
    return { ok: false, code: "ERROR" };
  } finally {
    client.release();
  }
}

function chicagoDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function chicagoTime(d = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export async function getBoard(now = new Date()): Promise<Board> {
  const sql = getSql();
  const cfg = await getSettingsMap();
  const agencies = await listAgencies({ activeOnly: true });
  const today = chicagoDate(now);

  const rows = (await sql`
    SELECT agency_name, time_label, status, start_at
    FROM slots
    ORDER BY start_at, agency_name
  `) as {
    agency_name: string;
    time_label: string;
    status: string;
    start_at: string | Date;
  }[];

  const times: string[] = [];
  const cells: Record<string, Record<string, SlotStatus>> = {};
  let any = false;

  for (const row of rows) {
    const start = new Date(row.start_at);
    if (chicagoDate(start) !== today) continue;
    any = true;
    if (!times.includes(row.time_label)) times.push(row.time_label);
    if (!cells[row.agency_name]) cells[row.agency_name] = {};
    cells[row.agency_name][row.time_label] = asStatus(row.status);
  }

  return {
    hasToday: any,
    times,
    agencies: agencies.map((ag) => ({
      name: ag.name,
      type: ag.type,
      cells: cells[ag.name] || {},
    })),
    room: cfg["Room"] || "",
    event: cfg["Event Name"] || "Forge Summit",
    updated: chicagoTime(now),
  };
}

export async function updateAgency(
  patch: Partial<Agency> & { name?: string; id?: number },
): Promise<Agency | null> {
  const sql = getSql();
  const currentRows = patch.id
    ? ((await sql`SELECT * FROM agencies WHERE id = ${patch.id}`) as AgencyRow[])
    : patch.name
      ? ((await sql`SELECT * FROM agencies WHERE name = ${patch.name}`) as AgencyRow[])
      : [];
  const current = currentRows[0];
  if (!current) return null;

  const type =
    patch.type === "Cohort" || patch.type === "Partner"
      ? patch.type
      : current.type;
  const next = {
    active: patch.active ?? current.active,
    type,
    rep_name: patch.repName ?? current.rep_name,
    rep_emails: patch.repEmails ?? current.rep_emails,
    blurb: patch.blurb ?? current.blurb,
    location: patch.location ?? current.location,
    website: patch.website ?? current.website,
    calendar_id: patch.calendarId ?? current.calendar_id,
  };

  const rows = (await sql`
    UPDATE agencies
    SET active = ${next.active},
        type = ${next.type},
        rep_name = ${next.rep_name},
        rep_emails = ${next.rep_emails},
        blurb = ${next.blurb},
        location = ${next.location},
        website = ${next.website},
        calendar_id = ${next.calendar_id}
    WHERE id = ${current.id}
    RETURNING *
  `) as AgencyRow[];

  return rows[0] ? mapAgency(rows[0]) : null;
}

export async function updateSetting(
  key: string,
  value: string,
): Promise<Record<string, string>> {
  const sql = getSql();
  await sql`
    INSERT INTO settings (key, value)
    VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `;
  return getSettingsMap();
}

export async function listSlots(filter?: {
  agency?: string;
  day?: string;
  status?: SlotStatus;
}): Promise<Slot[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM slots
    ORDER BY start_at, agency_name
  `) as SlotRow[];

  return rows
    .map(mapSlot)
    .filter((slot) => {
      if (filter?.agency && slot.agencyName !== filter.agency) return false;
      if (filter?.day && slot.dayLabel !== filter.day) return false;
      if (filter?.status && slot.status !== filter.status) return false;
      return true;
    });
}

export async function listOpsBookings(): Promise<OpsBooking[]> {
  const [slots, agencies] = await Promise.all([
    listSlots({ status: "Booked" }),
    listAgencies(),
  ]);
  const typeByName = new Map(agencies.map((ag) => [ag.name, ag.type]));
  return slots.map((slot) => ({
    id: slot.id,
    attendeeName: slot.attendeeName || "",
    attendeeEmail: slot.attendeeEmail || "",
    organization: slot.organization || "",
    topic: slot.topic || "",
    hostName: slot.agencyName,
    hostType: typeByName.get(slot.agencyName) || "Partner",
    day: slot.dayLabel,
    time: slot.timeLabel,
    confirmation: slot.confirmation || "",
    bookedAt: slot.bookedAt,
  }));
}

export async function getSlot(id: string): Promise<Slot | null> {
  const sql = getSql();
  const rows = (await sql`SELECT * FROM slots WHERE id = ${id}`) as SlotRow[];
  return rows[0] ? mapSlot(rows[0]) : null;
}

export async function updateSlotStatus(input: {
  id: string;
  status: SlotStatus;
  expectedStatus?: SlotStatus;
  attendeeName?: string | null;
  attendeeEmail?: string | null;
  organization?: string | null;
  topic?: string | null;
}): Promise<Slot | null | { conflict: true; slot: Slot }> {
  const existing = await getSlot(input.id);
  if (!existing) return null;

  if (input.expectedStatus && existing.status !== input.expectedStatus) {
    return { conflict: true, slot: existing };
  }

  // Refuse careless Booked→something else without explicit expectedStatus when
  // caller tries to set Open/Blocked over Booked without CAS.
  if (
    existing.status === "Booked" &&
    input.status !== "Booked" &&
    !input.expectedStatus
  ) {
    return { conflict: true, slot: existing };
  }

  const sql = getSql();
  const clearing = input.status !== "Booked";
  const attendeeName = clearing ? null : (input.attendeeName ?? existing.attendeeName);
  const attendeeEmail = clearing
    ? null
    : (input.attendeeEmail ?? existing.attendeeEmail);
  const organization = clearing
    ? null
    : (input.organization ?? existing.organization);
  const topic = clearing ? null : (input.topic ?? existing.topic);
  const confirmation = clearing ? null : existing.confirmation;
  const bookedAt = clearing ? null : existing.bookedAt || new Date().toISOString();

  const expected = input.expectedStatus || existing.status;
  const rows = (await sql`
    UPDATE slots
    SET status = ${input.status},
        attendee_name = ${attendeeName},
        attendee_email = ${attendeeEmail},
        organization = ${organization},
        topic = ${topic},
        confirmation = ${confirmation},
        booked_at = ${bookedAt}
    WHERE id = ${input.id} AND status = ${expected}
    RETURNING *
  `) as SlotRow[];

  if (!rows[0]) {
    const again = await getSlot(input.id);
    if (again) return { conflict: true, slot: again };
    return null;
  }

  return mapSlot(rows[0]);
}
