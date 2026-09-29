import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { denyUnlessAdmin } from "@/lib/adminRequest";
import { ensureSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

/** Full JSON backup of the booking tables (admin only, contains attendee PII). */
export async function GET(request: Request) {
  const denied = await denyUnlessAdmin(request);
  if (denied) return denied;
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const [agencies, slots, settings, schedule] = await Promise.all([
      client.query(`SELECT * FROM agencies ORDER BY id`),
      client.query(`SELECT * FROM slots ORDER BY agency_id, start_at, id`),
      client.query(`SELECT * FROM settings ORDER BY key`),
      client.query(`SELECT * FROM schedule ORDER BY date, start_time`),
    ]);
    await client.query("COMMIT");
    return NextResponse.json(
      {
        ok: true,
        exportedAt: new Date().toISOString(),
        tables: {
          agencies: agencies.rows,
          slots: slots.rows,
          settings: settings.rows,
          schedule: schedule.rows,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("export failed", err);
    return NextResponse.json({ ok: false, error: "Export failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
