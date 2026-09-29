import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Stateless admin session: `<expiresAtMs>.<hmac>` in an httpOnly cookie.
 * The HMAC key is derived from ADMIN_PASSWORD, so rotating the password
 * signs everyone out. The password never reaches the client bundle.
 */
export const ADMIN_COOKIE = "fsoh_admin";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function adminPassword(): string {
  return (process.env.ADMIN_PASSWORD || "").trim();
}

export function adminPasswordConfigured(): boolean {
  return adminPassword().length >= 12;
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

function sign(payload: string, password: string): string {
  const key = createHmac("sha256", password).update("fsoh-admin-session-v1").digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function checkPassword(candidate: string, password = adminPassword()): boolean {
  if (!password || password.length < 12) return false;
  return safeEqual(String(candidate || ""), password);
}

export function createSessionToken(now = Date.now(), password = adminPassword()): string {
  const exp = String(now + SESSION_TTL_MS);
  return `${exp}.${sign(`admin.${exp}`, password)}`;
}

export function verifySessionToken(
  token: string | null | undefined,
  now = Date.now(),
  password = adminPassword(),
): boolean {
  if (!token || !password || password.length < 12) return false;
  const [exp, mac] = String(token).split(".");
  if (!exp || !mac || !/^\d{10,16}$/.test(exp)) return false;
  if (Number(exp) <= now) return false;
  return safeEqual(mac, sign(`admin.${exp}`, password));
}

/** Coarse in-memory login throttle per IP (per server instance). */
const attempts = new Map<string, { count: number; resetAt: number }>();
export function loginThrottled(ip: string, now = Date.now()): boolean {
  const row = attempts.get(ip);
  if (!row || now >= row.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  row.count += 1;
  return row.count > 10;
}
export function clearLoginThrottle(ip: string): void {
  attempts.delete(ip);
}
