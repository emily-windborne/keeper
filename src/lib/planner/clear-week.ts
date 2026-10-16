import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";
import { addDaysISO } from "@/lib/planner/life-dump";
import { isRoutineMarkerId } from "@/lib/planner/routine-markers";

export type WeekClearPlan = {
  deleteItemIds: string[];
  deleteTaskIds: string[];
  defer: { id: string; next_due_date: string }[];
};

/**
 * One-offs on the shown week are deleted.
 * Recurring events on that week are deleted, and the item's next due moves past the week.
 * Routines and goals stay.
 */
export function weekItemsToClear(items: Item[], tasks: PlannedTask[], weekISOs: string[]): WeekClearPlan {
  const days = new Set(weekISOs);
  const byId = new Map(items.map((item) => [item.id, item]));
  const deleteItemIds = new Set<string>();
  const deleteTaskIds: string[] = [];
  const recurringTouched = new Set<string>();
  for (const task of tasks) {
    if (!days.has(task.scheduled_date)) continue;
    if (isRoutineMarkerId(task.id)) continue;
    const item = byId.get(task.item_id);
    if (item?.type === "anchor" || item?.type === "goal") continue;
    if (!item) {
      deleteTaskIds.push(task.id);
      continue;
    }
    if (item.type === "one_off") {
      deleteItemIds.add(item.id);
      continue;
    }
    if (item.type === "recurring") {
      deleteTaskIds.push(task.id);
      recurringTouched.add(item.id);
    }
  }
  const weekEnd = weekISOs[weekISOs.length - 1];
  const defer: WeekClearPlan["defer"] = [];
  if (weekEnd) {
    const after = `${addDaysISO(weekEnd, 1)}T12:00:00.000Z`;
    for (const id of recurringTouched) {
      const item = byId.get(id);
      if (!item) continue;
      const due = item.next_due_date?.slice(0, 10) ?? null;
      if (due && due > weekEnd) continue;
      defer.push({ id, next_due_date: after });
    }
  }
  return { deleteItemIds: [...deleteItemIds], deleteTaskIds, defer };
}
