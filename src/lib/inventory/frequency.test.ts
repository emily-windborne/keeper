import assert from "node:assert/strict";
import test from "node:test";
import { intervalOf, nextDueAfterCompletion } from "@/lib/inventory/frequency";

test("every 10 days is ten days, not ten months", () => {
  const rule = intervalOf({
    frequency_type: "custom",
    frequency_value: 10,
    frequency_unit: "days",
  });
  assert.deepEqual(rule, { unit: "days", every: 10 });
  const next = nextDueAfterCompletion(
    {
      ...rule,
      frequency_type: "custom",
      frequency_value: 10,
      frequency_unit: "days",
      recurrence_end: "never",
      recurrence_end_date: null,
      recurrence_end_count: null,
      completed_count: 0,
    },
    "2026-10-13T15:00:00.000Z",
  );
  assert.equal(next?.slice(0, 10), "2026-10-23");
});

test("a legacy custom value with no unit is still read as months", () => {
  const rule = intervalOf({
    frequency_type: "custom",
    frequency_value: 2,
    frequency_unit: null,
  });
  assert.deepEqual(rule, { unit: "months", every: 2 });
});

test("ends after N times stops the next due date", () => {
  const next = nextDueAfterCompletion(
    {
      frequency_type: "weekly",
      frequency_value: 1,
      frequency_unit: "weeks",
      recurrence_end: "after_count",
      recurrence_end_date: null,
      recurrence_end_count: 2,
      completed_count: 1,
    },
    "2026-10-13T15:00:00.000Z",
  );
  assert.equal(next, null);
});
