/** Display clocks. Stored times stay 24-hour `HH:MM`. */

const CLOCK = /^(\d{1,2}):([0-5]\d)$/;

export function formatClock(value: string | null | undefined): string {
  if (!value) return "";
  const match = value.trim().match(CLOCK);
  if (!match) return value.trim();
  const hour24 = Number(match[1]);
  const minute = match[2];
  if (hour24 > 23) return value.trim();
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${meridiem}`;
}

/** `5:20 – 6:05 PM` when both sides share a meridiem, otherwise `11:30 AM – 1:00 PM`. */
export function formatClockRange(start: string | null | undefined, end: string | null | undefined): string {
  const startLabel = formatClock(start);
  if (!end) return startLabel;
  const endLabel = formatClock(end);
  if (!startLabel || !endLabel) return startLabel || endLabel;
  const startMer = startLabel.endsWith(" AM") ? "AM" : startLabel.endsWith(" PM") ? "PM" : "";
  const endMer = endLabel.endsWith(" AM") ? "AM" : endLabel.endsWith(" PM") ? "PM" : "";
  if (startMer && startMer === endMer) {
    return `${startLabel.slice(0, -3)} – ${endLabel}`;
  }
  return `${startLabel} – ${endLabel}`;
}

/** `Sun, Oct 18 · 2:00 – 5:00 PM`. */
export function formatDayAndRange(
  dateISO: string,
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const day = new Date(`${dateISO}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (!start) return day;
  return `${day} · ${formatClockRange(start, end)}`;
}

const RANGE_IN_TEXT = /\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:to|–|-)\s*([01]?\d|2[0-3]):([0-5]\d)\b/g;
const CLOCK_IN_TEXT = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;

/** Rewrite 24-hour clocks inside notes and previews. Leaves dates and other words alone. */
export function formatClocksInText(text: string): string {
  const saved: string[] = [];
  const withRanges = text.replace(RANGE_IN_TEXT, (_full, sh: string, sm: string, eh: string, em: string) => {
    saved.push(formatClockRange(`${sh}:${sm}`, `${eh}:${em}`));
    return `\u0000${saved.length - 1}\u0000`;
  });
  const withSingles = withRanges.replace(CLOCK_IN_TEXT, (full) => formatClock(full));
  return withSingles.replace(/\u0000(\d+)\u0000/g, (_mark, index: string) => saved[Number(index)] ?? "");
}
