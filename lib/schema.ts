import { getPool } from "./db";
import { HOST_LOGO_PATHS } from "./logos";

/**
 * Idempotent, additive migrations. Safe to run on every cold start and from
 * `npm run db:migrate`. Never drops data or rewrites bookings.
 */
const STATEMENTS: string[] = [
  // Per-agency logo so renames keep their mark and new agencies can have one.
  `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS sort_order INTEGER`,
  `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
  `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
  // Double-booking guard at the DB level: one slot per host per start time.
  `CREATE UNIQUE INDEX IF NOT EXISTS slots_agency_start_uq ON slots (agency_id, start_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS slots_confirmation_uq ON slots (confirmation) WHERE confirmation IS NOT NULL`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'slots_status_chk') THEN
       ALTER TABLE slots ADD CONSTRAINT slots_status_chk
         CHECK (status IN ('Open', 'Booked', 'Blocked')) NOT VALID;
     END IF;
   END $$`,
  // Delivery log so failures are visible in /admin, not only in Vercel logs.
  `CREATE TABLE IF NOT EXISTS mail_log (
     id BIGSERIAL PRIMARY KEY,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     kind TEXT NOT NULL,
     slot_id TEXT,
     recipients TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL,
     provider_id TEXT,
     error TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS mail_log_created_idx ON mail_log (created_at DESC)`,
];

let ran: Promise<void> | null = null;

async function run(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    for (const statement of STATEMENTS) {
      try {
        await client.query(statement);
      } catch (err) {
        // Log and continue; a concurrent instance may have raced us, or
        // legacy data blocks an index. Booking must keep working.
        console.error("Migration statement failed", statement.slice(0, 80), err);
      }
    }
    for (const [name, path] of Object.entries(HOST_LOGO_PATHS)) {
      await client.query(
        `UPDATE agencies SET logo_url = $2 WHERE name = $1 AND logo_url = ''`,
        [name, path],
      );
    }
  } finally {
    client.release();
  }
}

/** Runs migrations once per server instance. */
export function ensureSchema(): Promise<void> {
  if (!ran) {
    ran = run().catch((err) => {
      ran = null;
      console.error("ensureSchema failed", err);
    });
  }
  return ran;
}
