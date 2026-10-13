export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type WeekdayName = (typeof WEEKDAYS)[number];

/** Display `preferred_days` as comma-separated weekday names. */
export function formatPreferredDays(days: string[] | null): string {
  return days?.length ? days.join(", ") : "";
}

/**
 * Parse free text like "wednesday" or "monday, thursday" into normalized weekday names.
 * Unknown tokens are dropped; empty after parsing → null.
 */
export function parsePreferredDaysInput(s: string): string[] | null {
  const parts = s
    .split(/[\s,;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ]);
  const out = parts.filter((d) => allowed.has(d));
  return out.length ? out : null;
}
