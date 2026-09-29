/** Per-host availability label: "32 times open", "1 time open", or "Fully booked". */
export function openTimesLabel(n: number): string {
  if (!Number.isFinite(n) || n < 1) return "Fully booked";
  return n === 1 ? "1 time open" : `${Math.floor(n)} times open`;
}
