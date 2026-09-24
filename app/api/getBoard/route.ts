import { NextResponse } from "next/server";
import { getBoard } from "@/lib/booking";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getBoard();
    return NextResponse.json(data);
  } catch (err) {
    console.error("getBoard failed", err);
    return NextResponse.json(
      { ok: false, error: "Could not load the board" },
      { status: 500 },
    );
  }
}
