import { after, NextResponse } from "next/server";
import { bookSlot } from "@/lib/booking";
import { notifyEmailsForSlot, recordMail } from "@/lib/agencies";
import { sendBookingEmails } from "@/lib/mail";
import { ensureSchema } from "@/lib/schema";
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
      return NextResponse.json({ ok: false, code: "RATE" }, { status: 429 });
    }

    let body: BookSlotInput;
    try {
      body = (await request.json()) as BookSlotInput;
    } catch {
      return NextResponse.json({ ok: false, code: "INVALID" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ ok: false, code: "INVALID" }, { status: 400 });
    }

    await ensureSchema();
    const result = await bookSlot(body);
    if (result.ok) {
      const slotId = String(body.slotId || "").trim();
      after(async () => {
        let hostEmails: string[] = [];
        try {
          hostEmails = (await notifyEmailsForSlot(slotId)).emails;
        } catch (err) {
          console.error("Could not load host notification emails", err);
        }
        await sendBookingEmails(
          {
            name: result.attendee.name,
            email: result.attendee.email,
            org: result.attendee.org,
            topic: result.attendee.topic,
            agency: result.agency,
            day: result.day,
            time: result.time,
            room: result.room,
            confirmation: result.confirmation,
          },
          {
            slotId,
            hostEmails,
            deps: {
              record: (id, r) =>
                recordMail({
                  kind: r.kind,
                  slotId: id,
                  recipients: r.to,
                  status: r.status,
                  providerId: r.id,
                  error: r.error,
                }),
            },
          },
        );
      });
    }
    if (result.ok) {
      // Never echo stored attendee fields beyond what the client needs.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { attendee, ...publicResult } = result;
      return NextResponse.json(publicResult);
    }
    const status = result.code === "INVALID" ? 400 : result.code === "ERROR" ? 500 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    console.error("bookSlot failed", err);
    return NextResponse.json({ ok: false, code: "ERROR" }, { status: 500 });
  }
}
