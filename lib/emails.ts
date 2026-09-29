/** Shared email parsing/validation for attendee + agency notification lists. */

export const EMAIL_RE = /^[^@\s,;<>"]+@[^@\s.,;<>"]+(\.[^@\s.,;<>"]+)*\.[a-z]{2,}$/i;
export const MAX_NOTIFY_EMAILS = 10;

export function isValidEmail(value: string): boolean {
  const v = value.trim();
  return v.length <= 254 && EMAIL_RE.test(v);
}

/**
 * Parse a list typed by a human: commas, semicolons, spaces or new lines.
 * Returns normalized (lower-case, de-duplicated) valid addresses and any
 * invalid tokens so the caller can reject the save with a clear message.
 */
export function parseEmailList(input: string | null | undefined): {
  emails: string[];
  invalid: string[];
} {
  const tokens = String(input || "")
    .split(/[\s,;]+/)
    .map((t) => t.trim().replace(/^<|>$/g, ""))
    .filter(Boolean);
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (!isValidEmail(lower)) {
      invalid.push(token);
      continue;
    }
    if (!emails.includes(lower)) emails.push(lower);
  }
  return { emails, invalid };
}

/** Stored form: comma + space separated. */
export function formatEmailList(emails: string[]): string {
  return emails.join(", ");
}
