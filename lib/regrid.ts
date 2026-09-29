/**
 * Slot-grid maintenance shared by the admin "add agency" flow and the one-off
 * 30 → 15 minute migration.
 *
 * Rules:
 * - Booked rows are never deleted, moved, or edited (start, end, attendee,
 *   confirmation all stay exactly as they were).
 * - Grid slots that overlap an existing booking (or an admin block) are kept
 *   out of circulation as `Blocked` rows with `covered_by` pointing at the
 *   booking. Cancelling that booking releases them again.
 */

export const DEFAULT_SLOT_MINUTES = 15;

/** Minimal client surface (pg PoolClient, Neon PoolClient, PGlite). */
export type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

async function rows<T>(client: Queryable, text: string, params?: unknown[]): Promise<T[]> {
  const res = await client.query(text, params);
  return res.rows as T[];
}

export async function slotMinutesSetting(client: Queryable): Promise<number> {
  const r = await rows<{ value: string }>(client, `SELECT value FROM settings WHERE key = 'Slot Minutes'`);
  const n = Number(r[0]?.value);
  return Number.isInteger(n) && n >= 5 && n <= 240 ? n : DEFAULT_SLOT_MINUTES;
}

/**
 * Insert any missing grid slots (Open) for one agency, or all agencies when
 * `agencyId` is null, from the `schedule` table in America/Chicago wall time.
 * Existing rows at the same (agency, start) are left untouched.
 */
export async function insertGrid(
  client: Queryable,
  slotMinutes: number,
  agencyId: number | null = null,
): Promise<number> {
  const inserted = await rows<{ id: string }>(
    client,
    `INSERT INTO slots (id, agency_id, agency_name, start_at, end_at, time_label, day_label, status)
     SELECT 'ag' || a.id || '-' || to_char(t, 'YYYYMMDD') || '-' || to_char(t, 'HH24MI'),
            a.id, a.name,
            t AT TIME ZONE 'America/Chicago',
            (t + make_interval(mins => $1::int)) AT TIME ZONE 'America/Chicago',
            to_char(t, 'FMHH12:MI AM'),
            sc.day_label,
            'Open'
     FROM agencies a
     CROSS JOIN schedule sc
     CROSS JOIN LATERAL generate_series(
       (sc.date || ' ' || sc.start_time)::timestamp,
       (sc.date || ' ' || sc.end_time)::timestamp - make_interval(mins => $1::int),
       make_interval(mins => $1::int)
     ) AS t
     WHERE ($2::int IS NULL OR a.id = $2::int)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [slotMinutes, agencyId],
  );
  return inserted.length;
}

/**
 * Take Open slots that overlap a booking or an admin block out of circulation.
 * Returns how many slots were newly covered.
 */
export async function coverOverlaps(client: Queryable, agencyId: number | null = null): Promise<number> {
  const covered = await rows<{ id: string }>(
    client,
    `UPDATE slots o
     SET status = 'Blocked', covered_by = b.id
     FROM slots b
     WHERE o.agency_id = b.agency_id
       AND o.id <> b.id
       AND o.status = 'Open'
       AND b.status IN ('Booked', 'Blocked')
       AND b.covered_by IS NULL
       AND o.start_at < b.end_at
       AND o.end_at > b.start_at
       AND ($1::int IS NULL OR o.agency_id = $1::int)
     RETURNING o.id`,
    [agencyId],
  );
  return covered.length;
}

/** Build (or top up) the grid for a single agency. Used by admin "add agency". */
export async function generateGridForAgency(client: Queryable, agencyId: number): Promise<number> {
  const minutes = await slotMinutesSetting(client);
  const created = await insertGrid(client, minutes, agencyId);
  await coverOverlaps(client, agencyId);
  return created;
}

/**
 * After a slot stops being Booked/Blocked (cancel, admin reopen): trim it to
 * the current slot length and release the grid slots it was covering.
 */
export async function releaseCovered(client: Queryable, slotId: string): Promise<number> {
  const minutes = await slotMinutesSetting(client);
  await client.query(
    `UPDATE slots SET end_at = start_at + make_interval(mins => $2::int)
     WHERE id = $1 AND status = 'Open'`,
    [slotId, minutes],
  );
  const released = await rows<{ id: string }>(
    client,
    `UPDATE slots SET status = 'Open', covered_by = NULL
     WHERE covered_by = $1 AND status = 'Blocked'
       AND EXISTS (SELECT 1 FROM slots p WHERE p.id = $1 AND p.status = 'Open')
     RETURNING id`,
    [slotId],
  );
  return released.length;
}

type Snapshot = {
  id: string;
  agency_id: number;
  start_at: string;
  end_at: string;
  status: string;
  attendee_name: string | null;
  attendee_email: string | null;
  organization: string | null;
  topic: string | null;
  booked_at: string | null;
  confirmation: string | null;
};

export type RegridReport = {
  slotMinutes: number;
  dryRun: boolean;
  backupTable: string | null;
  before: Record<string, number>;
  after: Record<string, number>;
  trimmedOpen: number;
  inserted: number;
  covered: number;
  removedOffGrid: number;
  booked: { id: string; agency: string; startAt: string; endAt: string; confirmation: string | null; hasAttendee: boolean }[];
};

async function statusCounts(client: Queryable): Promise<Record<string, number>> {
  const r = await rows<{ status: string; n: number }>(
    client,
    `SELECT status, count(*)::int AS n FROM slots GROUP BY status ORDER BY status`,
  );
  const out: Record<string, number> = { total: 0 };
  for (const row of r) {
    out[row.status] = Number(row.n);
    out.total += Number(row.n);
  }
  return out;
}

async function snapshotHeld(client: Queryable): Promise<Snapshot[]> {
  return rows<Snapshot>(
    client,
    `SELECT id, agency_id, start_at::text, end_at::text, status, attendee_name, attendee_email,
            organization, topic, booked_at::text, confirmation
     FROM slots WHERE status = 'Booked' OR (status = 'Blocked' AND covered_by IS NULL)
     ORDER BY id`,
  );
}

/**
 * Move every agency to a `slotMinutes` grid. Runs inside the caller's
 * transaction and throws (so the caller rolls back) if any booking changed or
 * an Open slot would overlap a booking.
 */
export async function regridAll(
  client: Queryable,
  slotMinutes: number,
  opts: { backupTable?: string | null; dryRun?: boolean } = {},
): Promise<RegridReport> {
  if (!Number.isInteger(slotMinutes) || slotMinutes < 5 || slotMinutes > 240) {
    throw new Error("slotMinutes must be a whole number between 5 and 240");
  }
  // Block concurrent bookings/cancels for the (short) duration of the regrid.
  await client.query(`LOCK TABLE slots IN SHARE ROW EXCLUSIVE MODE`);

  let backupTable: string | null = null;
  if (opts.backupTable) {
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(opts.backupTable)) throw new Error("Bad backup table name");
    await client.query(`CREATE TABLE IF NOT EXISTS ${opts.backupTable} AS SELECT * FROM slots`);
    backupTable = opts.backupTable;
  }

  const before = await statusCounts(client);
  const heldBefore = await snapshotHeld(client);

  // 1. Re-open previously covered slots; step 5 recomputes coverage from scratch.
  await client.query(`UPDATE slots SET status = 'Open', covered_by = NULL WHERE covered_by IS NOT NULL`);

  // 2. Open slots that don't sit on the new grid step (e.g. 15-minute leftovers
  //    when going back to 30) are removed; they have no attendee data.
  const removed = await rows<{ id: string }>(
    client,
    `DELETE FROM slots s
     USING schedule sc
     WHERE s.status = 'Open'
       AND to_char(s.start_at AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') = sc.date::text
       AND (EXTRACT(EPOCH FROM (s.start_at AT TIME ZONE 'America/Chicago') - (sc.date::text || ' ' || sc.start_time)::timestamp)::int / 60) % $1::int <> 0
     RETURNING s.id`,
    [slotMinutes],
  );

  // 3. Open slots take the new length (ids kept, so nothing in flight breaks).
  const trimmed = await rows<{ id: string }>(
    client,
    `UPDATE slots SET end_at = start_at + make_interval(mins => $1::int)
     WHERE status = 'Open' AND end_at <> start_at + make_interval(mins => $1::int)
     RETURNING id`,
    [slotMinutes],
  );

  // 4. Fill in the missing grid times for every agency.
  const inserted = await insertGrid(client, slotMinutes, null);

  // 5. Anything overlapping a booking / admin block is taken out of circulation.
  const covered = await coverOverlaps(client, null);

  await client.query(
    `INSERT INTO settings (key, value) VALUES ('Slot Minutes', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [String(slotMinutes)],
  );

  // Invariants: bookings byte-for-byte identical; no Open slot overlaps a booking.
  const heldAfter = await snapshotHeld(client);
  if (JSON.stringify(heldBefore) !== JSON.stringify(heldAfter)) {
    throw new Error("Regrid aborted: a booking or admin block changed");
  }
  const clash = await rows<{ n: number }>(
    client,
    `SELECT count(*)::int AS n FROM slots o JOIN slots b
       ON o.agency_id = b.agency_id AND o.id <> b.id
      AND o.start_at < b.end_at AND o.end_at > b.start_at
     WHERE o.status = 'Open' AND b.status = 'Booked'`,
  );
  if (Number(clash[0]?.n || 0) > 0) throw new Error("Regrid aborted: an Open slot overlaps a booking");

  const after = await statusCounts(client);
  const bookedRows = await rows<{
    id: string;
    agency_name: string;
    start_at: string;
    end_at: string;
    confirmation: string | null;
    has_attendee: boolean;
  }>(
    client,
    `SELECT id, agency_name, start_at::text, end_at::text, confirmation,
            (attendee_name IS NOT NULL AND attendee_email IS NOT NULL) AS has_attendee
     FROM slots WHERE status = 'Booked' ORDER BY start_at, agency_name`,
  );

  return {
    slotMinutes,
    dryRun: Boolean(opts.dryRun),
    backupTable,
    before,
    after,
    trimmedOpen: trimmed.length,
    inserted,
    covered,
    removedOffGrid: removed.length,
    booked: bookedRows.map((b) => ({
      id: b.id,
      agency: b.agency_name,
      startAt: b.start_at,
      endAt: b.end_at,
      confirmation: b.confirmation,
      hasAttendee: Boolean(b.has_attendee),
    })),
  };
}
