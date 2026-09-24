import { createHash, timingSafeEqual } from "crypto";
import { notFound } from "next/navigation";

function expectedSecret(): string {
  return (process.env.OPS_SECRET || "").trim();
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function opsSecretConfigured(): boolean {
  return Boolean(expectedSecret());
}

export function tokenMatchesOpsSecret(
  provided: string | null | undefined,
): boolean {
  const expected = expectedSecret();
  const token = String(provided || "").trim();
  if (!expected || !token) return false;
  try {
    return timingSafeEqual(sha256(token), sha256(expected));
  } catch {
    return false;
  }
}

export function requireOpsToken(provided: string | null | undefined): void {
  if (!tokenMatchesOpsSecret(provided)) {
    notFound();
  }
}
