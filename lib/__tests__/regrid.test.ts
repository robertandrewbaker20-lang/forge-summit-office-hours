import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { coverOverlaps, generateGridForAgency, insertGrid, regridAll, releaseCovered, type Queryable } from "../regrid";
import { openTimesLabel } from "../openTimes";

async function setup(): Promise<PGlite> {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(`
    CREATE TABLE agencies (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, type TEXT NOT NULL DEFAULT 'Partner', active BOOLEAN NOT NULL DEFAULT true);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE schedule (id SERIAL PRIMARY KEY, date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, day_label TEXT NOT NULL);
    CREATE TABLE slots (
      id TEXT PRIMARY KEY, agency_id INTEGER NOT NULL REFERENCES agencies(id), agency_name TEXT NOT NULL,
      start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ NOT NULL, time_label TEXT NOT NULL, day_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open', attendee_name TEXT, attendee_email TEXT, organization TEXT, topic TEXT,
      booked_at TIMESTAMPTZ, confirmation TEXT, calendar_event_id TEXT, covered_by TEXT);
    CREATE UNIQUE INDEX slots_agency_start_uq ON slots (agency_id, start_at);
    CREATE EXTENSION IF NOT EXISTS btree_gist;
    ALTER TABLE slots ADD CONSTRAINT slots_booked_no_overlap
      EXCLUDE USING gist (agency_id WITH =, tstzrange(start_at, end_at) WITH &&) WHERE (status = 'Booked');
    INSERT INTO agencies (name) VALUES ('SBA'), ('AEDC');
    INSERT INTO settings VALUES ('Slot Minutes', '30');
    INSERT INTO schedule (date, start_time, end_time, day_label) VALUES
      ('2026-10-13', '08:00', '16:00', 'Tuesday, Oct 13'), ('2026-10-14', '08:00', '16:00', 'Wednesday, Oct 14');
  `);
  // Legacy 30-minute grid + two real SBA bookings (8:00 and 8:30 on Oct 13).
  await insertGrid(db as unknown as Queryable, 30, null);
  await db.exec(`
    UPDATE slots SET status = 'Booked', attendee_name = 'A One', attendee_email = 'a1@example.com',
      booked_at = now(), confirmation = 'AAA111' WHERE id = 'ag1-20261013-0800';
    UPDATE slots SET status = 'Booked', attendee_name = 'B Two', attendee_email = 'b2@example.com',
      booked_at = now(), confirmation = 'BBB222' WHERE id = 'ag1-20261013-0830';
  `);
  return db;
}

async function regrid15(db: PGlite) {
  await db.exec("BEGIN");
  const r = await regridAll(db as unknown as Queryable, 15);
  await db.exec("COMMIT");
  return r;
}

async function q<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

describe("regrid 30 → 15 minutes", () => {
  it("keeps bookings intact, covers their second half, and makes 64 slots per host", async () => {
    const db = await setup();
    const before = await q<{ n: number }>(db, `SELECT count(*)::int n FROM slots`);
    assert.equal(before[0].n, 64);
    const booked0 = await q(db, `SELECT * FROM slots WHERE status = 'Booked' ORDER BY id`);

    await db.exec("BEGIN");
    const report = await regridAll(db as unknown as Queryable, 15, { backupTable: "slots_backup_test" });
    await db.exec("COMMIT");

    assert.equal(report.before.total, 64);
    assert.equal(report.after.total, 128);
    assert.equal(report.after.Booked, 2);
    assert.equal(report.covered, 2);
    assert.deepEqual(await q(db, `SELECT * FROM slots WHERE status = 'Booked' ORDER BY id`), booked0);
    assert.equal((await q<{ n: number }>(db, `SELECT count(*)::int n FROM slots_backup_test`))[0].n, 64);

    const sba = await q<{ id: string; time_label: string; status: string; covered_by: string | null }>(
      db,
      `SELECT id, time_label, status, covered_by FROM slots WHERE agency_id = 1 AND day_label LIKE 'Tue%' ORDER BY start_at LIMIT 5`,
    );
    assert.deepEqual(
      sba.map((r) => [r.time_label, r.status, r.covered_by]),
      [
        ["8:00 AM", "Booked", null],
        ["8:15 AM", "Blocked", "ag1-20261013-0800"],
        ["8:30 AM", "Booked", null],
        ["8:45 AM", "Blocked", "ag1-20261013-0830"],
        ["9:00 AM", "Open", null],
      ],
    );
    const open = await q<{ agency_id: number; n: number }>(
      db,
      `SELECT agency_id, count(*)::int n FROM slots WHERE status = 'Open' GROUP BY agency_id ORDER BY agency_id`,
    );
    assert.deepEqual(open.map((r) => r.n), [60, 64]);
    const last = await q<{ time_label: string; end_at: string }>(
      db,
      `SELECT time_label, to_char(end_at AT TIME ZONE 'America/Chicago', 'HH24:MI') end_at FROM slots WHERE agency_id = 2 ORDER BY start_at DESC LIMIT 1`,
    );
    assert.deepEqual(last[0], { time_label: "3:45 PM", end_at: "16:00" });
    assert.equal((await q<{ value: string }>(db, `SELECT value FROM settings WHERE key = 'Slot Minutes'`))[0].value, "15");

    // Idempotent.
    await db.exec("BEGIN");
    const again = await regridAll(db as unknown as Queryable, 15);
    await db.exec("COMMIT");
    assert.equal(again.inserted, 0);
    assert.equal(again.after.total, 128);
    assert.equal(again.after.Blocked, 2);
  });

  it("the database refuses an overlapping second booking", async () => {
    const db = await setup();
    await regrid15(db);
    await assert.rejects(
      db.query(`UPDATE slots SET status = 'Booked' WHERE id = 'ag1-20261013-0815'`),
      /slots_booked_no_overlap|exclusion/,
    );
  });

  it("cancelling a legacy booking frees both 15-minute slots", async () => {
    const db = await setup();
    await regrid15(db);
    await db.query(
      `UPDATE slots SET status = 'Open', attendee_name = NULL, attendee_email = NULL, confirmation = NULL WHERE id = 'ag1-20261013-0800'`,
    );
    assert.equal(await releaseCovered(db as unknown as Queryable, "ag1-20261013-0800"), 1);
    const rows = await q<{ status: string; mins: number }>(
      db,
      `SELECT status, (EXTRACT(EPOCH FROM end_at - start_at) / 60)::int mins FROM slots WHERE id IN ('ag1-20261013-0800', 'ag1-20261013-0815') ORDER BY id`,
    );
    assert.deepEqual(rows, [{ status: "Open", mins: 15 }, { status: "Open", mins: 15 }]);
    assert.equal(await coverOverlaps(db as unknown as Queryable), 0);
  });

  it("new agencies get the 15-minute grid", async () => {
    const db = await setup();
    await regrid15(db);
    await db.query(`INSERT INTO agencies (name) VALUES ('New Host')`);
    assert.equal(await generateGridForAgency(db as unknown as Queryable, 3), 64);
  });
});

describe("openTimesLabel", () => {
  it("handles plural, singular and zero", () => {
    assert.equal(openTimesLabel(32), "32 times open");
    assert.equal(openTimesLabel(1), "1 time open");
    assert.equal(openTimesLabel(0), "Fully booked");
  });
});
