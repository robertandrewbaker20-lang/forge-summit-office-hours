/** America/Chicago helpers. Never hardcode a UTC offset (DST ends Nov 1). */

export const TZ = "America/Chicago";

function offsetMinutesAt(utcMs: number, timeZone = TZ): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - utcMs) / 60000);
}

/** Wall-clock date (YYYY-MM-DD) + minutes after midnight in Chicago → Date. */
export function chicagoWallTimeToDate(date: string, minutesOfDay: number): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Bad date: ${date}`);
  const naive = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, minutesOfDay);
  let guess = naive - offsetMinutesAt(naive) * 60000;
  guess = naive - offsetMinutesAt(guess) * 60000;
  return new Date(guess);
}

export function parseHm(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim());
  if (!m) throw new Error(`Bad time: ${value}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function timeLabel(minutesOfDay: number): string {
  const hours = Math.floor(minutesOfDay / 60);
  const minutes = minutesOfDay % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  return `${h}:${String(minutes).padStart(2, "0")} ${period}`;
}

export function formatChicago(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d) + " CT";
}
