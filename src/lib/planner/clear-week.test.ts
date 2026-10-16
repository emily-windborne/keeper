import assert from "node:assert/strict";
import test from "node:test";
import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";
import { weekItemsToClear } from "@/lib/planner/clear-week";
import { routineMarkerId } from "@/lib/planner/routine-markers";

function item(partial: Partial<Item>): Item {
  return {
    id: "item",
    title: "Item",
    category: "Home",
    type: "recurring",
    frequency_type: "weekly",
    frequency_value: 1,
    frequency_unit: "weeks",
    times_per_period: 1,
    recurrence_end: "never",
    recurrence_end_date: null,
    recurrence_end_count: null,
    completed_count: 0,
    preferred_days: ["friday"],
    preferred_time_of_day: "morning",
    fixed_start_time: "09:00",
    estimated_minutes: 30,
    priority: "Standard",
    flexibility: "Fixed",
    cadence_pressure: "Can slide a little",
    minimum_success_threshold: null,
    notes: null,
    is_archived: false,
    last_completed_at: null,
    next_due_date: "2026-10-16T12:00:00.000Z",
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-01T12:00:00.000Z",
    ...partial,
  };
}

function task(partial: Partial<PlannedTask>): PlannedTask {
  return {
    id: "task",
    item_id: "item",
    title_snapshot: "Item",
    scheduled_date: "2026-10-16",
    scheduled_time_start: "09:00",
    scheduled_time_end: "09:30",
    status: "planned",
    priority_override: null,
    notes: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

const WEEK = ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"];

test("clear week removes one-offs and recurring events and leaves routines", () => {
  const routine = item({ id: "routine", type: "anchor", title: "Tanning drops" });
  const once = item({ id: "once", type: "one_off", title: "Ship package", frequency_type: null, frequency_value: null });
  const laundry = item({ id: "laundry", type: "recurring", title: "Laundry" });
  const later = item({ id: "later", type: "recurring", title: "Oil change", next_due_date: "2026-10-24T12:00:00.000Z" });
  const tasks = [
    task({ id: routineMarkerId("routine", "2026-10-16"), item_id: "routine", title_snapshot: "Tanning drops" }),
    task({ id: "once-task", item_id: "once", scheduled_date: "2026-10-14", title_snapshot: "Ship package" }),
    task({ id: "laundry-task", item_id: "laundry", scheduled_date: "2026-10-15", title_snapshot: "Laundry" }),
    task({ id: "later-task", item_id: "later", scheduled_date: "2026-10-24", title_snapshot: "Oil change" }),
  ];
  const plan = weekItemsToClear([routine, once, laundry, later], tasks, WEEK);
  assert.deepEqual(plan.deleteItemIds, ["once"]);
  assert.deepEqual(plan.deleteTaskIds, ["laundry-task"]);
  assert.deepEqual(plan.defer, [{ id: "laundry", next_due_date: "2026-10-18T12:00:00.000Z" }]);
});
