import assert from "node:assert/strict";
import test from "node:test";
import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";
import { proposalsFromRefine } from "@/lib/planner/schedule-preview";

const WEEK = [
  "2026-10-12",
  "2026-10-13",
  "2026-10-14",
  "2026-10-15",
  "2026-10-16",
  "2026-10-17",
  "2026-10-18",
];
const TODAY = "2026-10-13";
const NOW = new Date(2026, 9, 13, 8, 0, 0, 0);

function item(partial: Partial<Item> & Pick<Item, "id" | "title">): Item {
  return {
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
    preferred_days: null,
    preferred_time_of_day: "anytime",
    fixed_start_time: null,
    estimated_minutes: 30,
    priority: "Standard",
    flexibility: "Flexible anytime",
    cadence_pressure: "Can slide a little",
    minimum_success_threshold: null,
    notes: null,
    is_archived: false,
    last_completed_at: null,
    next_due_date: "2026-10-13T12:00:00.000Z",
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-01T12:00:00.000Z",
    ...partial,
  };
}

function task(partial: Partial<PlannedTask> & Pick<PlannedTask, "id" | "item_id">): PlannedTask {
  return {
    title_snapshot: "Task",
    scheduled_date: TODAY,
    scheduled_time_start: "09:00",
    scheduled_time_end: "09:30",
    status: "planned",
    priority_override: null,
    notes: null,
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-01T12:00:00.000Z",
    ...partial,
  };
}

test("a move is given a new time instead of keeping the old clock time", () => {
  const rows = proposalsFromRefine(
    [{ action: "move", planned_task_id: "t1", to_date: "2026-10-14" }],
    [item({ id: "yoga", title: "Yoga" })],
    [task({ id: "t1", item_id: "yoga", title_snapshot: "Yoga" })],
    WEEK,
    TODAY,
    NOW,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.available, true);
  assert.equal(rows[0]?.move?.scheduled_date, "2026-10-14");
  assert.equal(rows[0]?.move?.scheduled_time_start, "06:00");
  assert.notEqual(rows[0]?.move?.scheduled_time_start, "09:00");
});

test("an added task starts after a task that is already there", () => {
  const rows = proposalsFromRefine(
    [{ action: "add", item_id: "yoga", to_date: "2026-10-14" }],
    [item({ id: "yoga", title: "Yoga" }), item({ id: "call", title: "Call" })],
    [
      task({
        id: "busy",
        item_id: "call",
        title_snapshot: "Call",
        scheduled_date: "2026-10-14",
        scheduled_time_start: "06:00",
        scheduled_time_end: "07:00",
      }),
    ],
    WEEK,
    TODAY,
    NOW,
  );
  assert.equal(rows[0]?.add?.scheduled_time_start, "07:15");
});

test("a day that is already past is not offered", () => {
  const rows = proposalsFromRefine(
    [{ action: "add", item_id: "yoga", to_date: "2026-10-12" }],
    [item({ id: "yoga", title: "Yoga" })],
    [],
    WEEK,
    TODAY,
    NOW,
  );
  assert.equal(rows[0]?.available, false);
  assert.equal(rows[0]?.add, undefined);
});
