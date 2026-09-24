import { after, NextResponse } from "next/server";
import { bookSlot } from "@/lib/booking";
import { sendBookingEmails } from "@/lib/mail";
import type { BookSlotInput } from "@/lib/types";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const row = hits.get(ip);
  if (!row || now >= row.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  row.count += 1;
  if (hits.size > 5_000) {
    for (const [k, v] of hits) {
      if (now >= v.resetAt) hits.delete(k);
    }
  }
  return row.count > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  try {
    if (rateLimited(clientIp(request))) {
      return NextResponse.json(
        { ok: false, code: "RATE" },
        { status: 429 },
      );
    }

    let body: BookSlotInput;
    try {
      body = (await request.json()) as BookSlotInput;
    } catch {
      return NextResponse.json(
        { ok: false, code: "INVALID" },
        { status: 400 },
      );
    }

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
