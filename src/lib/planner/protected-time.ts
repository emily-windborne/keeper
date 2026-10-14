export const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type ProtectedWindow = {
  id: string;
  name: string;
  days: string[];
  startMin: number;
  endMin: number;
};

export function weekdayOf(dateISO: string): string {
  const [year, month, day] = dateISO.split("-").map(Number);
  if (!year || !month || !day) return "";
  return WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
}

export function windowsOnDate(windows: ProtectedWindow[], dateISO: string): ProtectedWindow[] {
  const day = weekdayOf(dateISO);
  return windows.filter(
    (window) =>
      window.endMin > window.startMin &&
      window.days.some((name) => name.toLowerCase() === day),
  );
}

export function windowOverlapping(
  windows: ProtectedWindow[],
  dateISO: string | null,
  startMin: number,
  endMin: number,
): ProtectedWindow | null {
  const relevant = dateISO ? windowsOnDate(windows, dateISO) : windows;
  return (
    relevant.find((window) => startMin < window.endMin && endMin > window.startMin) ?? null
  );
}

/**
 * Slide a flexible block out of protected time.
 * A start that already fits is returned unchanged.
 */
export function startOutsideProtected(
  start: number,
  duration: number,
  windows: ProtectedWindow[],
  dateISO: string | null,
  earliest: number,
  latest: number,
): number {
  const relevant = (dateISO ? windowsOnDate(windows, dateISO) : windows)
    .filter((window) => window.endMin > window.startMin)
    .sort((a, b) => a.startMin - b.startMin);
  let cursor = Math.max(start, earliest);
  for (let step = 0; step < relevant.length + 2; step += 1) {
    const hit = relevant.find((window) => cursor < window.endMin && cursor + duration > window.startMin);
    if (!hit) return cursor + duration <= latest ? cursor : start;
    if (hit.endMin + duration <= latest) {
      cursor = hit.endMin;
      continue;
    }
    const before = hit.startMin - duration;
    if (before >= earliest) return before;
    return start;
  }
  return cursor;
}

function asMinutes(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 0 || rounded > 24 * 60) return null;
  return rounded;
}

/** Accept rows from the database or from a request body. Invalid rows are dropped. */
export function protectedWindowsFromUnknown(value: unknown): ProtectedWindow[] {
  if (!Array.isArray(value)) return [];
  const windows: ProtectedWindow[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const startMin = asMinutes(record.startMin ?? record.start_minutes);
    const endMin = asMinutes(record.endMin ?? record.end_minutes);
    const rawDays = Array.isArray(record.days) ? record.days : [];
    const days = rawDays
      .filter((day): day is string => typeof day === "string")
      .map((day) => day.toLowerCase())
      .filter((day) => (WEEKDAY_NAMES as readonly string[]).includes(day));
    if (!name || startMin == null || endMin == null || endMin <= startMin || days.length === 0) continue;
    const id = typeof record.id === "string" && record.id ? record.id : name;
    windows.push({ id, name, days, startMin, endMin });
  }
  return windows;
}
