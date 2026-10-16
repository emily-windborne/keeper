import assert from "node:assert/strict";
import test from "node:test";
import type { Item } from "@/data/inventory-mock";
import { applyArchivePlan, planOneOffArchive } from "@/lib/inventory/one-off-archive";

function item(partial: Partial<Item>): Item {
  return {
    id: "item-1",
    title: "Tanning drops",
    category: "Personal",
    type: "one_off",
    frequency_type: null,
    frequency_value: null,
    frequency_unit: null,
    times_per_period: 1,
    recurrence_end: "never",
    recurrence_end_date: null,
    recurrence_end_count: null,
    completed_count: 0,
    preferred_days: null,
    preferred_time_of_day: null,
    fixed_start_time: "09:00",
    estimated_minutes: 15,
    priority: "Standard",
    flexibility: "Fixed",
    cadence_pressure: "Can slide a little",
    minimum_success_threshold: null,
    notes: null,
    is_archived: false,
    last_completed_at: null,
    next_due_date: "2026-10-20T12:00:00.000Z",
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-01T12:00:00.000Z",
    ...partial,
  };
}

const NOW = new Date("2026-10-16T15:00:00.000Z");

test("a future one-off stays out of the archive", () => {
  const plan = planOneOffArchive([item({})], "2026-10-16", NOW);
  assert.deepEqual(plan, { archiveIds: [], deleteIds: [] });
});

test("a past or finished one-off is archived, and a 30-day-old archive is deleted", () => {
  const past = item({ id: "past", next_due_date: "2026-10-15T12:00:00.000Z" });
  const done = item({ id: "done", last_completed_at: "2026-10-16T12:00:00.000Z" });
  const fresh = item({
    id: "fresh",
    is_archived: true,
    archived_at: "2026-10-01T15:00:00.000Z",
  });
  const old = item({
    id: "old",
    is_archived: true,
    archived_at: "2026-09-01T15:00:00.000Z",
    updated_at: "2026-09-01T15:00:00.000Z",
  });
  const routine = item({ id: "routine", type: "anchor", is_archived: true, archived_at: "2026-01-01T00:00:00.000Z" });
  const plan = planOneOffArchive([past, done, fresh, old, routine], "2026-10-16", NOW);
  assert.deepEqual(plan.archiveIds.sort(), ["done", "past"]);
  assert.deepEqual(plan.deleteIds, ["old"]);
  const next = applyArchivePlan([past, done, fresh, old, routine], plan, NOW.toISOString());
  assert.equal(next.find((row) => row.id === "past")?.is_archived, true);
  assert.equal(next.find((row) => row.id === "past")?.archived_at, NOW.toISOString());
  assert.equal(next.some((row) => row.id === "old"), false);
  assert.equal(next.some((row) => row.id === "routine"), true);
});
