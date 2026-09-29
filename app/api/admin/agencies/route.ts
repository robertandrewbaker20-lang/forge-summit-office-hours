import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listAgencies, updateAgency } from "@/lib/booking";
import { formatEmailList, parseEmailList } from "@/lib/emails";
import type { HostType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const agencies = await listAgencies();
  return NextResponse.json({ ok: true, agencies });
}

export async function PATCH(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  let body: {
    id?: number;
    name?: string;
    active?: boolean;
    type?: HostType;
    repName?: string;
    repEmails?: string;
    blurb?: string;
    location?: string;
    website?: string;
    calendarId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (body.repEmails !== undefined) {
    const { emails, invalid } = parseEmailList(String(body.repEmails));
    if (invalid.length || emails.length > 10) {
      return NextResponse.json(
        { ok: false, error: `Invalid repEmails: ${invalid.join(", ") || "too many"}` },
        { status: 400 },
      );
    }
    body.repEmails = formatEmailList(emails);
  }

  if (!body.id && !body.name) {
    return NextResponse.json(
      { ok: false, error: "Provide id or name" },
      { status: 400 },
    );
  }

  if (body.type && body.type !== "Partner" && body.type !== "Cohort") {
    return NextResponse.json(
      { ok: false, error: "type must be Partner or Cohort" },
      { status: 400 },
    );
  }

  const agency = await updateAgency(body);
  if (!agency) {
    return NextResponse.json({ ok: false, error: "Agency not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, agency, agencies: await listAgencies() });
}
