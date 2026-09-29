import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "./adminSession";
import { adminKeyConfigured, requireAdmin } from "./auth";

/** Admin API auth: signed-in /admin session cookie, or `Bearer ADMIN_API_KEY`. */
export async function denyUnlessAdmin(request: Request): Promise<NextResponse | null> {
  const store = await cookies();
  if (verifySessionToken(store.get(ADMIN_COOKIE)?.value)) return null;
  if (adminKeyConfigured() && (request.headers.get("authorization") || "")) {
    return requireAdmin(request);
  }
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}
