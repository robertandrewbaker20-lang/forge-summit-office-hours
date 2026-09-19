import { createHash, timingSafeEqual } from "crypto";
import { notFound } from "next/navigation";
import { previewOpsSecret } from "./preview-env";

function expectedSecret(): string {
  return (process.env.OPS_SECRET || previewOpsSecret).trim();
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
  return timingSafeEqual(sha256(token), sha256(expected));
}

export function requireOpsToken(provided: string | null | undefined): void {
  if (!tokenMatchesOpsSecret(provided)) {
    notFound();
  }
}

export function opsTokenFromSearch(
  search: Record<string, string | string[] | undefined>,
): string | undefined {
  const raw = search.key ?? search.token;
  if (Array.isArray(raw)) return raw[0];
  return raw;
}
