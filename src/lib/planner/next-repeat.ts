import type { SupabaseClient } from "@supabase/supabase-js";
import type { Item } from "@/data/inventory-mock";
import type { PlannedTask, NewPlannedTaskInput } from "@/lib/db/map-rows";
import { applyPlanMyWeek } from "@/lib/planner/apply-plan-my-week";
import { buildPlanMyWeekInputs, DEFAULT_DAY_START_MIN } from "@/lib/planner/plan-my-week";

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dueDay(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

/** The next open repeat for routines that are done or already due. */
export function buildNextRepeatInputs(
  items: Item[],
  existing: PlannedTask[],
  todayISO: string,
  now: Date = new Date(),
  dayStartMin: number = DEFAULT_DAY_START_MIN,
): NewPlannedTaskInput[] {
  const horizonEnd = addDaysISO(todayISO, 13);
  const horizon = Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO, i));
  const waiting = items.filter((item) => {
    if (item.is_archived) return false;
    if (item.type !== "recurring" && item.type !== "anchor") return false;
    const due = dueDay(item.next_due_date);
    if (due && due > horizonEnd) return false;
    const upcoming = existing.some(
      (task) =>
        task.item_id === item.id &&
        task.scheduled_date >= todayISO &&
        task.status !== "done" &&
        task.status !== "skipped",
    );
    return !upcoming;
  });
  if (waiting.length === 0) return [];
  const stillOpen = existing.filter((task) => task.status !== "done" && task.status !== "skipped");
  return buildPlanMyWeekInputs(waiting, stillOpen, horizon, todayISO, { now, dayStartMin }).inputs;
}

/** Write the next open repeats. Does not move due dates for items that will not fit. */
export async function saveNextRepeats(
  supabase: SupabaseClient,
  items: Item[],
  existing: PlannedTask[],
  todayISO: string,
  now: Date = new Date(),
  dayStartMin: number = DEFAULT_DAY_START_MIN,
): Promise<{ tasks: PlannedTask[]; error: string | null }> {
  const inputs = buildNextRepeatInputs(items, existing, todayISO, now, dayStartMin);
  if (inputs.length === 0) return { tasks: [], error: null };
  return applyPlanMyWeek(supabase, inputs, []);
}

export type ScheduleConflictOptions = {
  /** Quiet routines do not take a slot, so they never count as a double booking. */
  occupiesTime?: boolean;
  quietItemIds?: ReadonlySet<string>;
};

export function describeScheduleConflict(
  existing: PlannedTask[],
  dateISO: string,
  start: string | null,
  end: string | null,
  todayISO: string,
  now: Date,
  options?: ScheduleConflictOptions,
): string | null {
  if (dateISO < todayISO) return "That day is already past.";
  if (dateISO === todayISO && start) {
    const [h, m] = start.split(":").map(Number);
    const startMin = h * 60 + m;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (Number.isFinite(startMin) && startMin < nowMin) return "That time is already past.";
  }
  if (options?.occupiesTime === false) return null;
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const a = sh * 60 + sm;
  const b = eh * 60 + em;
  for (const task of existing) {
    if (task.scheduled_date !== dateISO) continue;
    if (task.status === "done" || task.status === "skipped") continue;
    if (options?.quietItemIds?.has(task.item_id)) continue;
    if (!task.scheduled_time_start || !task.scheduled_time_end) continue;
    const [th, tm] = task.scheduled_time_start.split(":").map(Number);
    const [xh, xm] = task.scheduled_time_end.split(":").map(Number);
    const c = th * 60 + tm;
    const d = xh * 60 + xm;
    if (a < d + 15 && b + 15 > c) {
      return `${task.title_snapshot} is already on the calendar then.`;
    }
  }
  return null;
}
