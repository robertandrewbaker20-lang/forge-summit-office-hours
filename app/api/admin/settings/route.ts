import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSettingsMap, updateSetting } from "@/lib/booking";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  return NextResponse.json({ ok: true, settings: await getSettingsMap() });
}

export async function PATCH(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    key?: string;
    value?: string | boolean | number;
    bookingOpen?: boolean;
    "Booking Open"?: string | boolean;
  };

  let key = body.key;
  let value = body.value;

  if (typeof body.bookingOpen === "boolean") {
    key = "Booking Open";
    value = body.bookingOpen ? "true" : "false";
  } else if (body["Booking Open"] !== undefined) {
    key = "Booking Open";
    value = body["Booking Open"];
  }

  if (!key) {
    return NextResponse.json(
      { ok: false, error: "Provide key/value or bookingOpen" },
      { status: 400 },
    );
  }

  const serialized =
    typeof value === "boolean" ? (value ? "true" : "false") : String(value ?? "");

  const settings = await updateSetting(key, serialized);
  return NextResponse.json({
    ok: true,
    setting: { key, value: settings[key] },
    settings,
  });
}
