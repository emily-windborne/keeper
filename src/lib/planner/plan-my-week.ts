import type { Item } from "@/data/inventory-mock";
import { intervalOf, repeatsEveryDay } from "@/lib/inventory/frequency";
import type { NewPlannedTaskInput, PlannedTask } from "@/lib/db/map-rows";
import { BUSINESS_END_MIN, BUSINESS_START_MIN, isBusinessErrand } from "@/lib/planner/life-dump";
import { windowsOnDate, type ProtectedWindow } from "@/lib/planner/protected-time";

/** Priority sort: lower = schedule first (more urgent). */
const PRIORITY_ORDER: Record<Item["priority"], number> = {
  Critical: 0,
  Important: 1,
  Standard: 2,
  Optional: 3,
};

/** Cadence: stricter first. */
const CADENCE_ORDER: Record<Item["cadence_pressure"], number> = {
  "Must stay on cadence": 0,
  "Can slide a little": 1,
  "Can defer": 2,
};

/** Minimum gap between the end of one task and the start of the next on the same day. */
const MIN_GAP_MINUTES = 15;

/** Default day start is 7:00. Settings can move it. */
export const DEFAULT_DAY_START_MIN = 7 * 60;
/** Tasks must finish by this minute-of-day (23:00). */
const SCHEDULE_LAST_END_MIN = 23 * 60;

export type DeferredPlanNotice = {
  itemId: string;
  title: string;
  nextDueISO: string;
  userMessage: string;
};

export type PlanMyWeekResult = {
  inputs: NewPlannedTaskInput[];
  /** Recurring/goal items with preferred_days that had no remaining slot this week; caller sets `next_due_date`. */
  deferred: DeferredPlanNotice[];
};

function dueDateOnlyISO(nextDue: string | null): string | null {
  if (!nextDue) return null;
  const leading = nextDue.match(/^(\d{4}-\d{2}-\d{2})/);
  if (leading && /T12:00:00/.test(nextDue)) return leading[1];
  const d = new Date(nextDue);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Recurring obligations never completed are always eligible for this week’s plan. */
function isRecurringNeverCompleted(item: Item): boolean {
  return item.type === "recurring" && item.last_completed_at == null;
}

function isDueByEndOfWeek(item: Item, weekEndISO: string): boolean {
  if (isRecurringNeverCompleted(item)) return true;
  const due = dueDateOnlyISO(item.next_due_date);
  if (!due) return true;
  return due <= weekEndISO;
}

function effectiveDueISOForPlanning(item: Item, weekStartISO: string): string {
  if (isRecurringNeverCompleted(item)) return weekStartISO;
  return dueDateOnlyISO(item.next_due_date) ?? weekStartISO;
}

function dayIndexInWeek(weekStartISO: string, dueISO: string): number {
  const a = new Date(`${weekStartISO}T12:00:00`).getTime();
  const b = new Date(`${dueISO}T12:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

function weekdayNameLower(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
}

function weekdayTitle(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
}

function addDaysToISO(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return iso;
  d.setDate(d.getDate() + deltaDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function firstPreferredDateOnOrAfter(startISO: string, preferredLower: Set<string>): string | null {
  for (let i = 0; i <= 370; i += 1) {
    const iso = addDaysToISO(startISO, i);
    if (preferredLower.has(weekdayNameLower(iso))) return iso;
  }
  return null;
}

function preferredDayIndices(weekDayISOs: string[], preferred: string[] | null): Set<number> | null {
  if (!preferred?.length) return null;
  const want = new Set(preferred.map((p) => p.trim().toLowerCase()));
  const out = new Set<number>();
  for (let i = 0; i < weekDayISOs.length; i++) {
    if (want.has(weekdayNameLower(weekDayISOs[i]!))) out.add(i);
  }
  return out.size ? out : null;
}

function minutesToTime(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseHHMM(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function minutesNowCeil(d: Date): number {
  let m = d.getHours() * 60 + d.getMinutes();
  if (d.getSeconds() > 0 || d.getMilliseconds() > 0) m += 1;
  return m;
}

/**
 * Valid placement window for this item on this calendar day.
 * Respects preferred_time_of_day bands; on `todayISO` never starts before “now”.
 * Returns null if the band is already impossible (e.g. morning item after noon today).
 */
function dayPlacementBounds(
  item: Item,
  dayISO: string,
  todayISO: string,
  now: Date,
  dayStartMin: number,
  wakeMin?: number,
  windDownMin?: number,
): { minStart: number; maxEnd: number } | null {
  const dur = Math.max(1, item.estimated_minutes);
  const notBefore = dayISO === todayISO ? minutesNowCeil(now) : dayStartMin;

  let bandMin: number;
  let bandMaxEnd: number;

  if (isBusinessErrand(item) && item.flexibility !== "Fixed") {
    bandMin = BUSINESS_START_MIN;
    bandMaxEnd = BUSINESS_END_MIN;
  } else if (item.flexibility === "Flexible anytime") {
    bandMin = dayStartMin;
    bandMaxEnd = SCHEDULE_LAST_END_MIN;
  } else {
    switch (item.preferred_time_of_day) {
      case "morning":
        bandMin = 8 * 60;
        bandMaxEnd = 12 * 60;
        break;
      case "afternoon":
        bandMin = 12 * 60;
        bandMaxEnd = 18 * 60;
        break;
      case "evening":
        bandMin = 17 * 60;
        bandMaxEnd = SCHEDULE_LAST_END_MIN;
        break;
      case "anytime":
      default:
        bandMin = 9 * 60;
        bandMaxEnd = SCHEDULE_LAST_END_MIN;
        break;
    }
  }

  if (wakeMin != null) bandMin = Math.max(bandMin, wakeMin);
  if (windDownMin != null) bandMaxEnd = Math.min(bandMaxEnd, windDownMin);
  const minStart = Math.max(bandMin, notBefore, wakeMin == null ? dayStartMin : Math.max(dayStartMin, wakeMin));
  const maxEnd = Math.min(bandMaxEnd, windDownMin ?? SCHEDULE_LAST_END_MIN);
  if (minStart + dur > maxEnd) return null;
  return { minStart, maxEnd };
}

function sortIntervals(ivs: { start: number; end: number }[]): { start: number; end: number }[] {
  return [...ivs].sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Earliest start minute such that [start, start+dur) fits in [minStart, maxEnd],
 * with at least MIN_GAP_MINUTES before/after any occupied interval.
 */
function findEarliestSlot(
  intervals: { start: number; end: number }[],
  dur: number,
  minStart: number,
  maxEnd: number,
  gap = MIN_GAP_MINUTES,
): number | null {
  const latestStart = maxEnd - dur;
  if (minStart > latestStart) return null;
  const sorted = sortIntervals(intervals);
  let candidate = minStart;
  for (const iv of sorted) {
    if (candidate > latestStart) return null;
    if (candidate + dur <= iv.start - gap) {
      return candidate;
    }
    candidate = Math.max(iv.end + gap, minStart);
  }
  if (candidate <= latestStart) return candidate;
  return null;
}

function taskOccupiesTime(t: PlannedTask, itemById: Map<string, Item>): boolean {
  return itemById.get(t.item_id)?.type !== "anchor";
}

function intervalFromPlannedTask(
  t: PlannedTask,
  itemById: Map<string, Item>,
): { start: number; end: number } | null {
  if (!taskOccupiesTime(t, itemById)) return null;
  const start = parseHHMM(t.scheduled_time_start);
  if (start == null) return null;
  const parsedEnd = parseHHMM(t.scheduled_time_end);
  const est = Math.max(1, itemById.get(t.item_id)?.estimated_minutes ?? 30);
  const end = parsedEnd ?? start + est;
  return { start, end: Math.max(end, start + 1) };
}

function estimatedMinutesForPlannedTask(t: PlannedTask, itemById: Map<string, Item>): number {
  if (!taskOccupiesTime(t, itemById)) return 0;
  const s = parseHHMM(t.scheduled_time_start);
  const e = parseHHMM(t.scheduled_time_end);
  if (s != null && e != null) return Math.max(1, e - s);
  return Math.max(1, itemById.get(t.item_id)?.estimated_minutes ?? 30);
}

/**
 * Day candidates for **one-off** items only — `preferred_days` is a soft hint (not a hard window).
 */
function allowedDayIndicesOneOff(
  item: Item,
  weekDayISOs: string[],
  dueISO: string,
  weekStartISO: string,
): number[] {
  const ideal = dayIndexInWeek(weekStartISO, dueISO);
  const n = weekDayISOs.length;

  let raw: number[];
  if (item.cadence_pressure === "Must stay on cadence") {
    if (ideal >= 0 && ideal < n) raw = [ideal];
    else if (ideal < 0) raw = [0];
    else raw = [n - 1];
  } else if (item.cadence_pressure === "Can slide a little") {
    if (ideal < 0) raw = [0, 1].filter((i) => i < n);
    else if (ideal >= n) raw = [n - 2, n - 1].filter((i) => i >= 0);
    else {
      raw = [ideal - 1, ideal, ideal + 1].filter((i) => i >= 0 && i < n);
    }
    if (raw.length === 0) raw = [Math.min(Math.max(ideal, 0), n - 1)];
  } else {
    raw = Array.from({ length: n }, (_, i) => i);
  }

  const pref = preferredDayIndices(weekDayISOs, item.preferred_days);
  if (pref && item.cadence_pressure !== "Must stay on cadence") {
    const intersect = raw.filter((i) => pref.has(i));
    if (intersect.length) return intersect.sort((a, b) => a - b);
  }

  return raw.sort((a, b) => a - b);
}

function allowedDayIndicesRecurringNoPreferred(
  item: Item,
  weekDayISOs: string[],
  dueISO: string,
  weekStartISO: string,
): number[] {
  const ideal = dayIndexInWeek(weekStartISO, dueISO);
  const n = weekDayISOs.length;

  let raw: number[];
  if (item.cadence_pressure === "Must stay on cadence") {
    if (ideal >= 0 && ideal < n) raw = [ideal];
    else if (ideal < 0) raw = [0];
    else raw = [n - 1];
  } else if (item.cadence_pressure === "Can slide a little") {
    if (ideal < 0) raw = [0, 1].filter((i) => i < n);
    else if (ideal >= n) raw = [n - 2, n - 1].filter((i) => i >= 0);
    else {
      raw = [ideal - 1, ideal, ideal + 1].filter((i) => i >= 0 && i < n);
    }
    if (raw.length === 0) raw = [Math.min(Math.max(ideal, 0), n - 1)];
  } else {
    raw = Array.from({ length: n }, (_, i) => i);
  }

  const pref = preferredDayIndices(weekDayISOs, item.preferred_days);
  if (pref && item.cadence_pressure !== "Must stay on cadence") {
    const intersect = raw.filter((i) => pref.has(i));
    if (intersect.length) return intersect.sort((a, b) => a - b);
  }

  return raw.sort((a, b) => a - b);
}

function usesHardPreferredDays(item: Item): boolean {
  return item.type !== "one_off" && Boolean(item.preferred_days?.length);
}

/** Sort day indices: lower total scheduled minutes first, then closer to ideal, then earlier in week. */
function sortDaysForPlacement(indices: number[], loads: number[], ideal: number): number[] {
  return [...new Set(indices)].sort((a, b) => {
    const la = loads[a] ?? 0;
    const lb = loads[b] ?? 0;
    if (la !== lb) return la - lb;
    const da = Math.abs(a - ideal);
    const db = Math.abs(b - ideal);
    if (da !== db) return da - db;
    return a - b;
  });
}

/**
 * Try to place `item` on one of `dayIndices` (in try order). Mutates `dayIntervals`, `loads`, appends to `outputs`.
 * Returns true if placed.
 */
/** How many copies of this item belong in one period (a day, if it is daily). */
export function timesPerPeriod(item: Item): number {
  const n = item.times_per_period ?? 1;
  if (!Number.isFinite(n)) return 1;
  return Math.min(14, Math.max(1, Math.round(n)));
}

function slotOverlaps(
  intervals: { start: number; end: number }[],
  start: number,
  end: number,
): boolean {
  return intervals.some((iv) => start < iv.end + MIN_GAP_MINUTES && end + MIN_GAP_MINUTES > iv.start);
}

/** Fixed clock time stays put. Returns null instead of sliding to another hour. */
function tryPlaceFixed(
  item: Item,
  dayIndices: number[],
  weekDayISOs: string[],
  todayISO: string,
  now: Date,
  dayStartMin: number,
  dayIntervals: Map<string, { start: number; end: number }[]>,
  loads: number[],
  outputs: NewPlannedTaskInput[],
): string | null {
  const startMin = parseHHMM(item.fixed_start_time);
  if (startMin == null) return null;
  void dayStartMin;
  const dur = Math.max(1, item.estimated_minutes);
  const endMin = startMin + dur;
  if (endMin > 24 * 60) return null;

  for (const dayIdx of dayIndices) {
    const dateISO = weekDayISOs[dayIdx]!;
    if (dateISO < todayISO) continue;
    const notBefore = dateISO === todayISO ? minutesNowCeil(now) : 0;
    if (startMin < notBefore) continue;
    const quiet = item.type === "anchor";
    const ivs = quiet ? [] : (dayIntervals.get(dateISO) ?? []);
    if (!quiet && slotOverlaps(ivs, startMin, endMin)) continue;
    if (!quiet) {
      ivs.push({ start: startMin, end: endMin });
      dayIntervals.set(dateISO, sortIntervals(ivs));
      loads[dayIdx] = (loads[dayIdx] ?? 0) + dur;
    }
    outputs.push({
      item_id: item.id,
      title_snapshot: item.title,
      scheduled_date: dateISO,
      scheduled_time_start: minutesToTime(startMin),
      scheduled_time_end: minutesToTime(endMin),
      status: "planned",
      priority_override: null,
      notes: null,
    });
    return dateISO;
  }
  return null;
}

function tryPlaceOnDays(
  item: Item,
  dayIndices: number[],
  weekDayISOs: string[],
  todayISO: string,
  now: Date,
  dayStartMin: number,
  dayIntervals: Map<string, { start: number; end: number }[]>,
  loads: number[],
  outputs: NewPlannedTaskInput[],
  wakeMin?: number,
  windDownMin?: number,
  protectedWindows: ProtectedWindow[] = [],
): string | null {
  if (item.flexibility === "Fixed" && item.fixed_start_time) {
    return tryPlaceFixed(
      item,
      dayIndices,
      weekDayISOs,
      todayISO,
      now,
      dayStartMin,
      dayIntervals,
      loads,
      outputs,
    );
  }
  const dur = Math.max(1, item.estimated_minutes);
  const ordered = [...dayIndices];

  for (const dayIdx of ordered) {
    const dateISO = weekDayISOs[dayIdx]!;
    if (dateISO < todayISO) continue;

    const bounds = dayPlacementBounds(item, dateISO, todayISO, now, dayStartMin, wakeMin, windDownMin);
    if (!bounds) continue;

    const quiet = item.type === "anchor";
    const occupied = quiet ? [] : (dayIntervals.get(dateISO) ?? []);
    const blocked = [
      ...occupied.map((iv) => ({ start: iv.start - MIN_GAP_MINUTES, end: iv.end + MIN_GAP_MINUTES })),
      ...windowsOnDate(protectedWindows, dateISO).map((window) => ({
        start: window.startMin,
        end: window.endMin,
      })),
    ];
    const startMin = findEarliestSlot(blocked, dur, bounds.minStart, bounds.maxEnd, 0);
    if (startMin == null) continue;

    const endMin = startMin + dur;
    if (!quiet) {
      occupied.push({ start: startMin, end: endMin });
      dayIntervals.set(dateISO, sortIntervals(occupied));
      loads[dayIdx] = (loads[dayIdx] ?? 0) + dur;
    }
    outputs.push({
      item_id: item.id,
      title_snapshot: item.title,
      scheduled_date: dateISO,
      scheduled_time_start: minutesToTime(startMin),
      scheduled_time_end: minutesToTime(endMin),
      status: "planned",
      priority_override: null,
      notes: null,
    });
    return dateISO;
  }
  return null;
}

/**
 * Deterministic "Plan my week": eligible inventory items → planned tasks.
 *
 * Tasks on the same day are sequential with at least 15 minutes between them, never double-booked.
 * Placement respects preferred_time_of_day bands, current time on today, and load-balances across allowed days.
 */
export type PlanScheduleOptions = {
  now?: Date;
  /** Minutes from midnight. Defaults to 7:00. */
  dayStartMin?: number;
  /** Ordinary tasks stay at or after this. Fixed events can sit earlier. */
  wakeMin?: number;
  /** Ordinary tasks finish by this. Fixed events can run later. */
  windDownMin?: number;
  /** Flexible tasks stay out of these. A named fixed clock time may sit inside. */
  protectedWindows?: ProtectedWindow[];
};

function resolveSchedule(input?: Date | PlanScheduleOptions): {
  now: Date;
  dayStartMin: number;
  wakeMin?: number;
  windDownMin?: number;
  protectedWindows: ProtectedWindow[];
} {
  if (input instanceof Date || input == null) {
    return { now: input ?? new Date(), dayStartMin: DEFAULT_DAY_START_MIN, protectedWindows: [] };
  }
  const dayStart = input.dayStartMin;
  const wake = input.wakeMin;
  const wind = input.windDownMin;
  return {
    now: input.now ?? new Date(),
    dayStartMin:
      typeof dayStart === "number" && dayStart >= 0 && dayStart <= 20 * 60
        ? dayStart
        : DEFAULT_DAY_START_MIN,
    wakeMin: typeof wake === "number" && wake >= 0 && wake < 24 * 60 ? wake : undefined,
    windDownMin: typeof wind === "number" && wind > 0 && wind <= 24 * 60 ? wind : undefined,
    protectedWindows: input.protectedWindows ?? [],
  };
}

export function buildPlanMyWeekInputs(
  items: Item[],
  existingPlanned: PlannedTask[],
  weekDayISOs: string[],
  todayISO: string,
  nowOrOptions: Date | PlanScheduleOptions = new Date(),
): PlanMyWeekResult {
  const { now, dayStartMin, wakeMin, windDownMin, protectedWindows } = resolveSchedule(nowOrOptions);
  const empty: PlanMyWeekResult = { inputs: [], deferred: [] };
  if (weekDayISOs.length === 0) return empty;

  const weekStartISO = weekDayISOs[0]!;
  const weekEndISO = weekDayISOs[weekDayISOs.length - 1]!;
  const weekSet = new Set(weekDayISOs);
  const itemById = new Map(items.map((i) => [i.id, i]));

  const countInWeek = new Map<string, number>();
  const countOnDay = new Map<string, number>();
  for (const t of existingPlanned) {
    if (!weekSet.has(t.scheduled_date)) continue;
    countInWeek.set(t.item_id, (countInWeek.get(t.item_id) ?? 0) + 1);
    const key = `${t.item_id}|${t.scheduled_date}`;
    countOnDay.set(key, (countOnDay.get(key) ?? 0) + 1);
  }

  const eligible = items.filter((item) => {
    if (item.is_archived) return false;
    return isDueByEndOfWeek(item, weekEndISO);
  });

  const sorted = [...eligible].sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    const c = CADENCE_ORDER[a.cadence_pressure] - CADENCE_ORDER[b.cadence_pressure];
    if (c !== 0) return c;
    if (b.estimated_minutes !== a.estimated_minutes) return b.estimated_minutes - a.estimated_minutes;
    return a.id.localeCompare(b.id);
  });

  const loads = weekDayISOs.map((iso) => {
    let sum = 0;
    for (const t of existingPlanned) {
      if (t.scheduled_date !== iso) continue;
      sum += estimatedMinutesForPlannedTask(t, itemById);
    }
    return sum;
  });

  const dayIntervals = new Map<string, { start: number; end: number }[]>();
  for (const iso of weekDayISOs) {
    dayIntervals.set(iso, []);
  }
  for (const t of existingPlanned) {
    if (!weekSet.has(t.scheduled_date)) continue;
    const iv = intervalFromPlannedTask(t, itemById);
    if (!iv) continue;
    const list = dayIntervals.get(t.scheduled_date)!;
    list.push(iv);
    dayIntervals.set(t.scheduled_date, sortIntervals(list));
  }

  const outputs: NewPlannedTaskInput[] = [];
  const deferred: DeferredPlanNotice[] = [];
  const allDayIndices = weekDayISOs.map((_, i) => i);

  for (const item of sorted) {
    const dueISO = effectiveDueISOForPlanning(item, weekStartISO);
    const ideal = Math.min(Math.max(dayIndexInWeek(weekStartISO, dueISO), 0), weekDayISOs.length - 1);

    let allowed: number[];

    if (item.type === "one_off" && item.flexibility === "Fixed" && item.fixed_start_time) {
      const due = dueDateOnlyISO(item.next_due_date);
      const idx = due ? weekDayISOs.indexOf(due) : -1;
      allowed = idx >= 0 ? [idx] : [];
    } else if (item.type === "one_off") {
      allowed = allowedDayIndicesOneOff(item, weekDayISOs, dueISO, weekStartISO);
    } else if (usesHardPreferredDays(item)) {
      const prefLower = new Set(item.preferred_days!.map((p) => p.trim().toLowerCase()));
      const prefInWeek = weekDayISOs
        .map((iso, i) => ({ iso, i }))
        .filter(({ iso }) => prefLower.has(weekdayNameLower(iso)))
        .map(({ i }) => i);

      const validPreferred = prefInWeek
        .filter((i) => (weekDayISOs[i] ?? "") >= todayISO)
        .sort((a, b) => a - b);

      if (validPreferred.length === 0) {
        const afterWeek = addDaysToISO(weekEndISO, 1);
        const nextDueISO =
          firstPreferredDateOnOrAfter(afterWeek, prefLower) ?? addDaysToISO(weekEndISO, 7);
        const dayLabel = weekdayTitle(nextDueISO);
        deferred.push({
          itemId: item.id,
          title: item.title,
          nextDueISO,
          userMessage: `${item.title} couldn't fit this week -- scheduled for next ${dayLabel}.`,
        });
        continue;
      }

      allowed = validPreferred;
    } else {
      allowed = allowedDayIndicesRecurringNoPreferred(item, weekDayISOs, dueISO, weekStartISO);
    }

    if (allowed.length === 0) continue;

    const times = timesPerPeriod(item);
    const pref = preferredDayIndices(weekDayISOs, item.preferred_days);
    const spreadAcrossWeek =
      repeatsEveryDay(item) || (times > 1 && !usesHardPreferredDays(item));
    const placeDays = spreadAcrossWeek
      ? weekDayISOs
          .map((_, i) => i)
          .filter((i) => (weekDayISOs[i] ?? "") >= todayISO && (!pref || pref.has(i)))
      : allowed.filter((i) => (weekDayISOs[i] ?? "") >= todayISO);
    if (placeDays.length === 0) continue;

    const idealClamped = placeDays.reduce((best, i) => {
      const da = Math.abs(i - ideal);
      const db = Math.abs(best - ideal);
      return da < db ? i : best;
    }, placeDays[0]!);

    const before = outputs.length;

    const { unit, every } = intervalOf(item);
    const spacedDays =
      unit === "days" && every > 1
        ? placeDays.filter((i) => {
            const anchor = dueDateOnlyISO(item.next_due_date) ?? todayISO;
            const delta = dayIndexInWeek(anchor, weekDayISOs[i]!);
            return delta >= 0 && delta % Math.round(every) === 0;
          })
        : placeDays;

    if (repeatsEveryDay(item)) {
      for (const dayIdx of spacedDays) {
        const iso = weekDayISOs[dayIdx]!;
        if (iso < todayISO) continue;
        const have = countOnDay.get(`${item.id}|${iso}`) ?? 0;
        let need = times - have;
        while (need > 0) {
          const placedIso = tryPlaceOnDays(
            item,
            [dayIdx],
            weekDayISOs,
            todayISO,
            now,
            dayStartMin,
            dayIntervals,
            loads,
            outputs,
            wakeMin,
            windDownMin,
            protectedWindows,
          );
          if (!placedIso) break;
          countOnDay.set(`${item.id}|${placedIso}`, (countOnDay.get(`${item.id}|${placedIso}`) ?? 0) + 1);
          need -= 1;
        }
      }
      continue;
    }

    const have = countInWeek.get(item.id) ?? 0;
    let need = times - have;
    const usedDays = new Set<number>();
    while (need > 0) {
      const fresh = placeDays.filter((i) => !usedDays.has(i));
      const tryIdx = fresh.length > 0 ? fresh : placeDays;
      const primaryTry = sortDaysForPlacement(tryIdx, loads, idealClamped);
      let placedIso = tryPlaceOnDays(
        item,
        primaryTry,
        weekDayISOs,
        todayISO,
        now,
        dayStartMin,
        dayIntervals,
        loads,
        outputs,
        wakeMin,
        windDownMin,
        protectedWindows,
      );
      if (
        !placedIso &&
        item.cadence_pressure === "Can defer" &&
        !usesHardPreferredDays(item)
      ) {
        const fallback = sortDaysForPlacement(
          allDayIndices.filter((i) => fresh.length === 0 || !usedDays.has(i)),
          loads,
          idealClamped,
        );
        placedIso = tryPlaceOnDays(
          item,
          fallback.length ? fallback : allDayIndices,
          weekDayISOs,
          todayISO,
          now,
          dayStartMin,
          dayIntervals,
          loads,
          outputs,
          wakeMin,
          windDownMin,
          protectedWindows,
        );
      }
      if (!placedIso) break;
      const idx = weekDayISOs.indexOf(placedIso);
      if (idx >= 0) usedDays.add(idx);
      need -= 1;
    }

    if (outputs.length === before && need > 0 && usesHardPreferredDays(item) && have === 0) {
      const prefLower = new Set(item.preferred_days!.map((p) => p.trim().toLowerCase()));
      const afterWeek = addDaysToISO(weekEndISO, 1);
      const nextDueISO =
        firstPreferredDateOnOrAfter(afterWeek, prefLower) ?? addDaysToISO(weekEndISO, 7);
      const dayLabel = weekdayTitle(nextDueISO);
      deferred.push({
        itemId: item.id,
        title: item.title,
        nextDueISO,
        userMessage: `${item.title} had no open slot on preferred days this week -- scheduled for next ${dayLabel}.`,
      });
    }
  }

  return { inputs: outputs, deferred };
}

/** One open time for this item. The caller chooses the days. Clock time comes from the rules here. */
export function suggestSlot(
  item: Item,
  candidateDayISOs: string[],
  existing: PlannedTask[],
  todayISO: string,
  now: Date,
  dayStartMin: number = DEFAULT_DAY_START_MIN,
  wakeMin?: number,
  windDownMin?: number,
  protectedWindows: ProtectedWindow[] = [],
): { scheduled_date: string; scheduled_time_start: string; scheduled_time_end: string } | null {
  const days = candidateDayISOs.filter((iso) => iso >= todayISO);
  if (days.length === 0) return null;
  const itemById = new Map<string, Item>([[item.id, item]]);
  const dayIntervals = new Map<string, { start: number; end: number }[]>();
  for (const iso of days) dayIntervals.set(iso, []);
  for (const task of existing) {
    if (task.status === "done" || task.status === "skipped") continue;
    if (!dayIntervals.has(task.scheduled_date)) continue;
    const iv = intervalFromPlannedTask(task, itemById);
    if (!iv) continue;
    const list = dayIntervals.get(task.scheduled_date)!;
    list.push(iv);
    dayIntervals.set(task.scheduled_date, sortIntervals(list));
  }
  const outputs: NewPlannedTaskInput[] = [];
  const placed = tryPlaceOnDays(
    item,
    days.map((_, index) => index),
    days,
    todayISO,
    now,
    dayStartMin,
    dayIntervals,
    days.map(() => 0),
    outputs,
    wakeMin,
    windDownMin,
    protectedWindows,
  );
  const first = outputs[0];
  if (!placed || !first?.scheduled_time_start || !first.scheduled_time_end) return null;
  return {
    scheduled_date: first.scheduled_date,
    scheduled_time_start: first.scheduled_time_start,
    scheduled_time_end: first.scheduled_time_end,
  };
}
