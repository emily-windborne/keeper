import assert from "node:assert/strict";
import test from "node:test";
import type { Item } from "@/data/inventory-mock";
import { completionPatchForItem } from "@/lib/planner/mark-task-done";

function item(partial: Partial<Item>): Item {
  return {
    id: "item-1",
    title: "Water plants",
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
    preferred_days: ["wednesday"],
    preferred_time_of_day: "morning",
    estimated_minutes: 20,
    priority: "Standard",
    flexibility: "Flexible anytime",
    cadence_pressure: "Can slide a little",
    minimum_success_threshold: null,
    notes: "Keep the fern damp",
    is_archived: false,
    last_completed_at: null,
    next_due_date: "2026-10-14T12:00:00.000Z",
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-01T12:00:00.000Z",
    ...partial,
  };
}

test("one-off mark done archives the item and keeps notes untouched", () => {
  const patch = completionPatchForItem(
    item({ type: "one_off", frequency_type: null, frequency_value: null, notes: "Call the vet" }),
    "2026-10-13T15:00:00.000Z",
  );
  assert.deepEqual(patch, {
    is_archived: true,
    last_completed_at: "2026-10-13T15:00:00.000Z",
    updated_at: "2026-10-13T15:00:00.000Z",
  });
});

test("recurring mark done advances next due without rewriting notes", () => {
  const patch = completionPatchForItem(item({}), "2026-10-13T15:00:00.000Z");
  assert.equal(patch?.last_completed_at, "2026-10-13T15:00:00.000Z");
  assert.ok(patch?.next_due_date);
  assert.equal("notes" in (patch ?? {}), false);
});

test("goals are not auto-archived when marked done", () => {
  const patch = completionPatchForItem(item({ type: "goal" }), "2026-10-13T15:00:00.000Z");
  assert.equal(patch, null);
});
