import { NextResponse } from "next/server";
import { previewAdminApiKey } from "./preview-env";

function adminSecret(): string {
  return process.env.ADMIN_API_KEY || previewAdminApiKey;
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export function adminKeyConfigured(): boolean {
  return Boolean(adminSecret());
}

export function requireAdmin(request: Request): NextResponse | null {
  const expected = adminSecret();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_API_KEY is not configured" },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";

  if (!token || token !== expected) {
    return unauthorized();
  }

  return null;
}
