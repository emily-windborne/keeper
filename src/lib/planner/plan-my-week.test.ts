import assert from "node:assert/strict";
import test from "node:test";
import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";
import { buildPlanMyWeekInputs } from "@/lib/planner/plan-my-week";

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

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

test("a weekly item set to 3 times lands three separate tasks", () => {
  const result = buildPlanMyWeekInputs(
    [item({ id: "yoga", title: "Yoga", times_per_period: 3, preferred_days: ["tuesday", "thursday", "saturday"] })],
    [],
    WEEK,
    TODAY,
    NOW,
  );
  assert.equal(result.inputs.length, 3);
  const days = result.inputs.map((t) => t.scheduled_date);
  assert.deepEqual(new Set(days).size, 3);
  for (const day of days) assert.ok(day >= TODAY);
});

test("a daily item is placed once on each remaining day, not once a week", () => {
  const result = buildPlanMyWeekInputs(
    [item({ id: "meds", title: "Meds", frequency_type: "daily", frequency_unit: "days", frequency_value: 1, times_per_period: 1 })],
    [],
    WEEK,
    TODAY,
    NOW,
  );
  const days = result.inputs.map((t) => t.scheduled_date).sort();
  assert.deepEqual(days, WEEK.filter((d) => d >= TODAY));
});

test("tasks already on the week count toward times per period", () => {
  const existing: PlannedTask = {
    id: "t1",
    item_id: "yoga",
    title_snapshot: "Yoga",
    scheduled_date: "2026-10-13",
    scheduled_time_start: "09:00",
    scheduled_time_end: "09:30",
    status: "planned",
    priority_override: null,
    notes: null,
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-01T12:00:00.000Z",
  };
  const result = buildPlanMyWeekInputs(
    [item({ id: "yoga", title: "Yoga", times_per_period: 3 })],
    [existing],
    WEEK,
    TODAY,
    NOW,
  );
  assert.equal(result.inputs.length, 2);
  assert.ok(result.inputs.every((t) => t.scheduled_date !== "2026-10-13" || t.scheduled_time_start !== "09:00"));
});

test("a fixed clock time stays at that time", () => {
  const result = buildPlanMyWeekInputs(
    [
      item({
        id: "mom",
        title: "Visit mom",
        flexibility: "Fixed",
        fixed_start_time: "13:00",
        estimated_minutes: 180,
        preferred_days: ["wednesday"],
        frequency_unit: "weeks",
        times_per_period: 1,
      }),
    ],
    [],
    WEEK,
    TODAY,
    NOW,
  );
  assert.equal(result.inputs.length, 1);
  assert.equal(result.inputs[0]?.scheduled_date, "2026-10-14");
  assert.equal(result.inputs[0]?.scheduled_time_start, "13:00");
  assert.equal(result.inputs[0]?.scheduled_time_end, "16:00");
});

test("a taken fixed time is not moved to a different hour", () => {
  const blocking: PlannedTask = {
    id: "busy",
    item_id: "other",
    title_snapshot: "Busy",
    scheduled_date: "2026-10-14",
    scheduled_time_start: "13:00",
    scheduled_time_end: "16:00",
    status: "planned",
    priority_override: null,
    notes: null,
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-01T12:00:00.000Z",
  };
  const result = buildPlanMyWeekInputs(
    [
      item({
        id: "mom",
        title: "Visit mom",
        flexibility: "Fixed",
        fixed_start_time: "13:00",
        estimated_minutes: 180,
        preferred_days: ["wednesday"],
      }),
    ],
    [blocking],
    WEEK,
    TODAY,
    NOW,
  );
  assert.equal(result.inputs.length, 0);
});

test("the day can start at 6:00 instead of 7:00", () => {
  const early = new Date(2026, 9, 13, 6, 10, 0, 0);
  const result = buildPlanMyWeekInputs(
    [item({ id: "walk", title: "Walk", flexibility: "Flexible anytime", estimated_minutes: 30, times_per_period: 1 })],
    [],
    WEEK,
    TODAY,
    { now: early, dayStartMin: 6 * 60 },
  );
  const todayTask = result.inputs.find((t) => t.scheduled_date === TODAY);
  assert.ok(todayTask);
  assert.equal(todayTask?.scheduled_time_start, "06:10");
});

test("occurrences on the same day do not overlap", () => {
  const result = buildPlanMyWeekInputs(
    [item({ id: "stretch", title: "Stretch", times_per_period: 3, preferred_days: ["tuesday"], estimated_minutes: 45 })],
    [],
    WEEK,
    TODAY,
    NOW,
  );
  assert.equal(result.inputs.length, 3);
  const slots = result.inputs
    .map((t) => ({
      start: minutes(t.scheduled_time_start!),
      end: minutes(t.scheduled_time_end!),
    }))
    .sort((a, b) => a.start - b.start);
  for (let i = 1; i < slots.length; i += 1) {
    assert.ok(slots[i].start >= slots[i - 1].end + 15);
  }
});

test("a routine marker does not block a task at the same time", () => {
  const routine: PlannedTask = {
    id: "skin-task",
    item_id: "skin",
    title_snapshot: "Skincare",
    scheduled_date: "2026-10-13",
    scheduled_time_start: "09:00",
    scheduled_time_end: "09:20",
    status: "planned",
    priority_override: null,
    notes: null,
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-01T12:00:00.000Z",
  };
  const result = buildPlanMyWeekInputs(
    [
      item({
        id: "skin",
        title: "Skincare",
        type: "anchor",
        flexibility: "Fixed",
        fixed_start_time: "09:00",
        estimated_minutes: 20,
        preferred_days: ["tuesday"],
        times_per_period: 1,
      }),
      item({
        id: "call",
        title: "Call",
        flexibility: "Fixed",
        fixed_start_time: "09:00",
        estimated_minutes: 20,
        preferred_days: ["tuesday"],
      }),
    ],
    [routine],
    WEEK,
    TODAY,
    NOW,
  );
  const call = result.inputs.find((t) => t.item_id === "call");
  assert.ok(call);
  assert.equal(call?.scheduled_date, "2026-10-13");
  assert.equal(call?.scheduled_time_start, "09:00");
  assert.equal(result.inputs.some((t) => t.item_id === "skin"), false);
});
