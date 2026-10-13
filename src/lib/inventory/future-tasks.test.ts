import assert from "node:assert/strict";
import test from "node:test";
import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";
import { patchesForFutureTasks } from "@/lib/inventory/future-tasks";

const TODAY = "2026-10-13";

function item(): Item {
  return {
    id: "yoga",
    title: "Yoga",
    category: "Health",
    type: "recurring",
    frequency_type: "weekly",
    frequency_value: 1,
    frequency_unit: "weeks",
    times_per_period: 1,
    recurrence_end: "never",
    recurrence_end_date: null,
    recurrence_end_count: null,
    completed_count: 0,
    preferred_days: null,
    preferred_time_of_day: "morning",
    fixed_start_time: null,
    estimated_minutes: 45,
    priority: "Standard",
    flexibility: "Flexible anytime",
    cadence_pressure: "Can slide a little",
    minimum_success_threshold: null,
    notes: null,
    is_archived: false,
    last_completed_at: null,
    next_due_date: null,
    created_at: "",
    updated_at: "",
  };
}

function task(partial: Partial<PlannedTask> & Pick<PlannedTask, "id" | "scheduled_date" | "status">): PlannedTask {
  return {
    item_id: "yoga",
    title_snapshot: "Old name",
    scheduled_time_start: "09:00",
    scheduled_time_end: "09:30",
    priority_override: null,
    notes: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

test("upcoming tasks pick up the new title and length", () => {
  const patches = patchesForFutureTasks(
    item(),
    [
      task({ id: "soon", scheduled_date: "2026-10-14", status: "planned" }),
      task({ id: "done", scheduled_date: "2026-10-14", status: "done" }),
      task({ id: "past", scheduled_date: "2026-10-12", status: "planned" }),
    ],
    TODAY,
  );
  assert.equal(patches.length, 1);
  assert.equal(patches[0]?.id, "soon");
  assert.equal(patches[0]?.title_snapshot, "Yoga");
  assert.equal(patches[0]?.scheduled_time_end, "09:45");
});
