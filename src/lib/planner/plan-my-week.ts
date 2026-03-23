import type { Item } from "@/data/inventory-mock";
import type { NewPlannedTaskInput, PlannedTask } from "@/lib/db/map-rows";

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

function dueDateOnlyISO(nextDue: string | null): string | null {
  if (!nextDue) return null;
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

/**
 * Whether the item should be considered due by the end of the planning week.
 * Missing `next_due_date` is treated as due (inventory often has no computed date yet).
 */
function isDueByEndOfWeek(item: Item, weekEndISO: string): boolean {
  if (isRecurringNeverCompleted(item)) return true;
  const due = dueDateOnlyISO(item.next_due_date);
  if (!due) return true;
  return due <= weekEndISO;
}

/**
 * Anchor date for picking the ideal day within the week. Uses `next_due_date` when set;
 * otherwise the week start (schedule toward the beginning of the week).
 */
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

function timeWindowForItem(item: Item): { scheduled_time_start: string; scheduled_time_end: string } {
  const mins = Math.max(1, item.estimated_minutes);
  let startMin: number;
  switch (item.preferred_time_of_day) {
    case "morning":
      startMin = 9 * 60;
      break;
    case "afternoon":
      startMin = 14 * 60;
      break;
    case "evening":
      startMin = 18 * 60;
      break;
    default:
      startMin = 10 * 60;
  }

  if (item.flexibility === "Flexible anytime") {
    startMin = 10 * 60;
  }

  const endMin = startMin + mins;
  return {
    scheduled_time_start: minutesToTime(startMin),
    scheduled_time_end: minutesToTime(endMin),
  };
}

function allowedDayIndices(
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

function pickDayForLoadBalance(
  allowed: number[],
  loads: number[],
  idealDayIndex: number,
): number {
  const sorted = [...allowed].sort((a, b) => {
    const la = loads[a] ?? 0;
    const lb = loads[b] ?? 0;
    if (la !== lb) return la - lb;
    const da = Math.abs(a - idealDayIndex);
    const db = Math.abs(b - idealDayIndex);
    if (da !== db) return da - db;
    return a - b;
  });
  return sorted[0]!;
}

/**
 * Deterministic "Plan my week": eligible inventory items → planned tasks spread across 7 days
 * by estimated_minutes load, respecting cadence + flexibility.
 *
 * Eligible items: not archived; due by end of week when `next_due_date` is set; if it is null
 * or invalid, treated as due; recurring items with no `last_completed_at` are always eligible.
 */
export function buildPlanMyWeekInputs(
  items: Item[],
  existingPlanned: PlannedTask[],
  weekDayISOs: string[],
): NewPlannedTaskInput[] {
  if (weekDayISOs.length === 0) return [];

  const weekStartISO = weekDayISOs[0]!;
  const weekEndISO = weekDayISOs[weekDayISOs.length - 1]!;
  const weekSet = new Set(weekDayISOs);

  const existingItemIds = new Set<string>();
  for (const t of existingPlanned) {
    if (weekSet.has(t.scheduled_date)) existingItemIds.add(t.item_id);
  }

  const eligible = items.filter((item) => {
    if (item.is_archived) return false;
    return isDueByEndOfWeek(item, weekEndISO);
  });

  const candidates = eligible.filter((item) => !existingItemIds.has(item.id));

  const sorted = [...candidates].sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    const c = CADENCE_ORDER[a.cadence_pressure] - CADENCE_ORDER[b.cadence_pressure];
    if (c !== 0) return c;
    if (b.estimated_minutes !== a.estimated_minutes) return b.estimated_minutes - a.estimated_minutes;
    return a.id.localeCompare(b.id);
  });

  const loads = weekDayISOs.map(() => 0);
  const outputs: NewPlannedTaskInput[] = [];

  for (const item of sorted) {
    const dueISO = effectiveDueISOForPlanning(item, weekStartISO);
    const ideal = Math.min(Math.max(dayIndexInWeek(weekStartISO, dueISO), 0), weekDayISOs.length - 1);

    const allowed = allowedDayIndices(item, weekDayISOs, dueISO, weekStartISO);
    if (allowed.length === 0) continue;

    const dayIdx = pickDayForLoadBalance(allowed, loads, ideal);
    const dateISO = weekDayISOs[dayIdx]!;
    loads[dayIdx] = (loads[dayIdx] ?? 0) + item.estimated_minutes;

    const tw = timeWindowForItem(item);
    outputs.push({
      item_id: item.id,
      title_snapshot: item.title,
      scheduled_date: dateISO,
      scheduled_time_start: tw.scheduled_time_start,
      scheduled_time_end: tw.scheduled_time_end,
      status: "planned",
      priority_override: null,
      notes: null,
    });
  }

  return outputs;
}
