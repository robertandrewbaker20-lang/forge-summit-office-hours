import { after, NextResponse } from "next/server";
import { bookSlot } from "@/lib/booking";
import { sendBookingEmails } from "@/lib/mail";
import type { BookSlotInput } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BookSlotInput;
    const result = await bookSlot(body);
    if (result.ok) {
      after(() =>
        sendBookingEmails({
          name: String(body.name || "").trim(),
          email: String(body.email || "").trim().toLowerCase(),
          org: String(body.org || "").trim(),
          topic: String(body.topic || "").trim(),
          agency: result.agency,
          day: result.day,
          time: result.time,
          room: result.room,
          confirmation: result.confirmation,
        }),
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("bookSlot failed", err);
    return NextResponse.json({ ok: false, code: "ERROR" }, { status: 500 });
  }
}
