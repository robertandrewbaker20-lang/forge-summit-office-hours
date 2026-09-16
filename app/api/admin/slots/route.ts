import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listSlots, updateSlotStatus } from "@/lib/booking";
import type { SlotStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: SlotStatus[] = ["Open", "Booked", "Blocked"];

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const agency = url.searchParams.get("agency") || undefined;
  const day = url.searchParams.get("day") || undefined;
  const statusParam = url.searchParams.get("status");
  const status = STATUSES.includes(statusParam as SlotStatus)
    ? (statusParam as SlotStatus)
    : undefined;

  const slots = await listSlots({ agency, day, status });
  return NextResponse.json({ ok: true, slots });
}

export async function PATCH(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    id?: string;
    status?: SlotStatus;
    attendeeName?: string;
    attendeeEmail?: string;
    organization?: string;
    topic?: string;
  };

  if (!body.id) {
    return NextResponse.json({ ok: false, error: "Provide slot id" }, { status: 400 });
  }
  if (!body.status || !STATUSES.includes(body.status)) {
    return NextResponse.json(
      { ok: false, error: "status must be Open, Booked, or Blocked" },
      { status: 400 },
    );
  }

  const slot = await updateSlotStatus({
    id: body.id,
    status: body.status,
    attendeeName: body.attendeeName,
    attendeeEmail: body.attendeeEmail,
    organization: body.organization,
    topic: body.topic,
  });

  if (!slot) {
    return NextResponse.json({ ok: false, error: "Slot not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, slot });
}
