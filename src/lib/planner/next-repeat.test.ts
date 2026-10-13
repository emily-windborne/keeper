import assert from "node:assert/strict";
import test from "node:test";
import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";
import { buildNextRepeatInputs, describeScheduleConflict } from "@/lib/planner/next-repeat";

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
    preferred_days: ["tuesday"],
    preferred_time_of_day: "morning",
    fixed_start_time: null,
    estimated_minutes: 30,
    priority: "Standard",
    flexibility: "Flexible anytime",
    cadence_pressure: "Can slide a little",
    minimum_success_threshold: null,
    notes: "keep me",
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

test("an item that already has an upcoming task is not scheduled again", () => {
  const inputs = buildNextRepeatInputs(
    [item({ id: "yoga", title: "Yoga" })],
    [task({ id: "t1", item_id: "yoga", scheduled_date: "2026-10-15" })],
    TODAY,
    NOW,
  );
  assert.equal(inputs.length, 0);
});

test("a finished repeat with no upcoming task gets the next one", () => {
  const inputs = buildNextRepeatInputs(
    [item({ id: "yoga", title: "Yoga" })],
    [task({ id: "t1", item_id: "yoga", status: "done" })],
    TODAY,
    NOW,
  );
  assert.equal(inputs.length, 1);
  assert.ok(inputs[0]!.scheduled_date >= TODAY);
});

test("a repeat that is not due for two weeks stays off the horizon", () => {
  const inputs = buildNextRepeatInputs(
    [item({ id: "yoga", title: "Yoga", next_due_date: "2026-11-01T12:00:00.000Z" })],
    [],
    TODAY,
    NOW,
  );
  assert.equal(inputs.length, 0);
});

test("a past day and a past time are rejected", () => {
  assert.equal(
    describeScheduleConflict([], "2026-10-12", "09:00", "09:30", TODAY, NOW),
    "That day is already past.",
  );
  assert.equal(
    describeScheduleConflict([], TODAY, "07:00", "07:30", TODAY, NOW),
    "That time is already past.",
  );
});

test("an overlapping task is rejected, and a routine is not", () => {
  const busy = task({ id: "busy", item_id: "call", title_snapshot: "Call" });
  const routine = task({ id: "skin", item_id: "skin", title_snapshot: "Skincare" });
  assert.equal(
    describeScheduleConflict([busy], TODAY, "09:10", "09:40", TODAY, NOW),
    "Call is already on the calendar then.",
  );
  assert.equal(
    describeScheduleConflict([routine], TODAY, "09:10", "09:40", TODAY, NOW, {
      quietItemIds: new Set(["skin"]),
    }),
    null,
  );
  assert.equal(
    describeScheduleConflict([busy], TODAY, "09:10", "09:40", TODAY, NOW, { occupiesTime: false }),
    null,
  );
});
