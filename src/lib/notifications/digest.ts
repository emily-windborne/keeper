export const MORNING_DEFAULT_MINUTES = 7 * 60 + 30;
export const NIGHTLY_DEFAULT_MINUTES = 23 * 60;
export const SEND_WINDOW_MINUTES = 20;

export function morningDigestBody(titles: string[]): string {
  if (titles.length === 0) return "Today: nothing scheduled.";
  const noun = titles.length === 1 ? "thing" : "things";
  return `Today: ${titles.length} ${noun}. Start with ${titles[0]}.`;
}

export function orderedTitles(tasks: { title: string; start: string | null }[]): string[] {
  return [...tasks]
    .sort(
      (a, b) =>
        (a.start ?? "99:99").localeCompare(b.start ?? "99:99") || a.title.localeCompare(b.title),
    )
    .map((task) => task.title);
}

/** True when local time has reached the chosen minute and the send window is still open. */
export function isInsideSendWindow(
  nowMinutes: number,
  targetMinutes: number,
  windowMinutes = SEND_WINDOW_MINUTES,
): boolean {
  if (nowMinutes < 0 || nowMinutes >= 24 * 60) return false;
  if (targetMinutes < 0 || targetMinutes >= 24 * 60) return false;
  const end = targetMinutes + windowMinutes;
  if (end <= 24 * 60) return nowMinutes >= targetMinutes && nowMinutes < end;
  const wrapped = end % (24 * 60);
  return nowMinutes >= targetMinutes || nowMinutes < wrapped;
}

export function zonedClock(now: Date, timeZone: string): { date: string; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
    const year = get("year");
    const month = get("month");
    const day = get("day");
    const hourRaw = get("hour");
    const minuteRaw = get("minute");
    if (!year || !month || !day || hourRaw == null || minuteRaw == null) return null;
    const hour = Number(hourRaw) % 24;
    const minute = Number(minuteRaw);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { date: `${year}-${month}-${day}`, minutes: hour * 60 + minute };
  } catch {
    return null;
  }
}

export function clockToMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function minutesToClock(total: number): string {
  const clamped = Math.min(23 * 60 + 59, Math.max(0, Math.round(total)));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
