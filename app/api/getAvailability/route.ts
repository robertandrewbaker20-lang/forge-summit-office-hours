import { NextResponse } from "next/server";
import { getAvailability } from "@/lib/booking";
import { ensureSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSchema();
    const data = await getAvailability();
    return NextResponse.json(data);
  } catch (err) {
    console.error("getAvailability failed", err);
    return NextResponse.json(
      { ok: false, error: "Could not load availability" },
      { status: 500 },
    );
  }
}
