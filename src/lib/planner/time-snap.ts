export const SNAP_MINUTES = 15;
export const TIMELINE_START_MIN = 6 * 60;
export const TIMELINE_END_MIN = 24 * 60;

export function snapMinutes(value: number, snap = SNAP_MINUTES): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / snap) * snap;
}

/** Clock text for a minute offset. Midnight is stored as 23:59 so the rest of the app can read it. */
export function minutesToHHMM(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function shiftBlock(options: {
  startMin: number;
  endMin: number;
  deltaMinutes: number;
  minStart: number;
  maxEnd: number;
}): { startMin: number; endMin: number } {
  const dur = Math.max(SNAP_MINUTES, options.endMin - options.startMin);
  let start = snapMinutes(options.startMin + options.deltaMinutes);
  let end = start + dur;
  if (start < options.minStart) {
    start = options.minStart;
    end = start + dur;
  }
  if (end > options.maxEnd) {
    end = options.maxEnd;
    start = Math.max(options.minStart, end - dur);
  }
  return { startMin: start, endMin: Math.max(start + SNAP_MINUTES, end) };
}

export function resizeBlock(options: {
  startMin: number;
  endMin: number;
  deltaMinutes: number;
  maxEnd: number;
}): { startMin: number; endMin: number } {
  let end = snapMinutes(options.endMin + options.deltaMinutes);
  const minEnd = options.startMin + SNAP_MINUTES;
  if (end < minEnd) end = minEnd;
  if (end > options.maxEnd) end = options.maxEnd;
  if (end < minEnd) end = minEnd;
  return { startMin: options.startMin, endMin: end };
}

export function minutesFromPointerY(
  y: number,
  height: number,
  minStart: number,
  maxEnd: number,
): number {
  if (height <= 0) return minStart;
  const ratio = Math.min(1, Math.max(0, y / height));
  return snapMinutes(minStart + ratio * (maxEnd - minStart));
}

export function dayOffsetFromDelta(deltaX: number, columnWidth: number): number {
  if (!Number.isFinite(columnWidth) || columnWidth < 24) return 0;
  return Math.round(deltaX / columnWidth);
}
