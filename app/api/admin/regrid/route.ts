import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getPool } from "@/lib/db";
import { denyUnlessAdmin } from "@/lib/adminRequest";
import { ensureSchema } from "@/lib/schema";
import { regridAll, type Queryable } from "@/lib/regrid";

export const dynamic = "force-dynamic";

/**
 * Move every host to a new slot length. Never sends mail and never touches
 * booked rows (see lib/regrid.ts). `dryRun: true` runs everything, reports,
 * and rolls back.
 */
export async function POST(request: Request) {
  const denied = await denyUnlessAdmin(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as {
    slotMinutes?: number;
    dryRun?: boolean;
    backupTable?: string;
  };
  const slotMinutes = Number(body.slotMinutes ?? 15);
  const dryRun = body.dryRun !== false;
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const report = await regridAll(client as unknown as Queryable, slotMinutes, {
      dryRun,
      backupTable: dryRun ? null : body.backupTable || null,
    });
    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
    if (!dryRun) {
      revalidatePath("/");
      revalidatePath("/admin");
    }
    return NextResponse.json({ ok: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("regrid failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Regrid failed" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
