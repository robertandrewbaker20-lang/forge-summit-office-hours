import { NextResponse } from "next/server";
import { getAvailability } from "@/lib/booking";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
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
