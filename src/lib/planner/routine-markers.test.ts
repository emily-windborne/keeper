import assert from "node:assert/strict";
import test from "node:test";
import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";
import { routineMarkers } from "@/lib/planner/routine-markers";

const WEEK = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];

function routine(): Item {
  return {
    id: "wind",
    title: "Wind-down",
    category: "Personal",
    type: "anchor",
    frequency_type: "weekly",
    frequency_value: 1,
    frequency_unit: "weeks",
    times_per_period: 1,
    recurrence_end: "never",
    recurrence_end_date: null,
    recurrence_end_count: null,
    completed_count: 0,
    preferred_days: ["monday", "wednesday"],
    preferred_time_of_day: "evening",
    fixed_start_time: "21:00",
    estimated_minutes: 20,
    priority: "Standard",
    flexibility: "Fixed",
    cadence_pressure: "Must stay on cadence",
    minimum_success_threshold: null,
    notes: null,
    is_archived: false,
    last_completed_at: null,
    next_due_date: null,
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-01T12:00:00.000Z",
  };
}

test("a Monday and Wednesday routine still shows after its saved copy is gone", () => {
  const saved: PlannedTask = {
    id: "kept",
    item_id: "wind",
    title_snapshot: "Wind-down",
    scheduled_date: "2026-10-12",
    scheduled_time_start: "21:00",
    scheduled_time_end: "21:20",
    status: "planned",
    priority_override: null,
    notes: null,
    created_at: "",
    updated_at: "",
  };
  const markers = routineMarkers([routine()], WEEK, [saved]);
  assert.equal(markers.some((row) => row.scheduled_date === "2026-10-12"), false);
  const wednesday = markers.find((row) => row.scheduled_date === "2026-10-14");
  assert.ok(wednesday);
  assert.equal(wednesday?.scheduled_time_start, "21:00");
  assert.equal(wednesday?.title_snapshot, "Wind-down");
  assert.equal(markers.length, 1);
});
