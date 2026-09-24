import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

function adminSecret(): string {
  return (process.env.ADMIN_API_KEY || "").trim();
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
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

  if (!token) return unauthorized();
  try {
    if (!timingSafeEqual(sha256(token), sha256(expected))) {
      return unauthorized();
    }
  } catch {
    return unauthorized();
  }

  return null;
}
