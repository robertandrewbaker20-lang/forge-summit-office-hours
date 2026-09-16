import { NextResponse } from "next/server";
import { bookSlot } from "@/lib/booking";
import type { BookSlotInput } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BookSlotInput;
    const result = await bookSlot(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error("bookSlot failed", err);
    return NextResponse.json({ ok: false, code: "ERROR" }, { status: 500 });
  }
}
