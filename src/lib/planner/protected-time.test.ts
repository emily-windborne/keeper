import assert from "node:assert/strict";
import test from "node:test";
import {
  startOutsideProtected,
  weekdayOf,
  windowOverlapping,
  type ProtectedWindow,
} from "@/lib/planner/protected-time";

export const SCHOOL_RUN: ProtectedWindow = {
  id: "school",
  name: "Morning school run",
  days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  startMin: 7 * 60 + 30,
  endMin: 9 * 60,
};

export const DINNER: ProtectedWindow = {
  id: "dinner",
  name: "Dinner & bedtime",
  days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  startMin: 18 * 60 + 30,
  endMin: 20 * 60 + 30,
};

const WINDOWS = [SCHOOL_RUN, DINNER];

test("Wednesday is a school-run day and Sunday is not", () => {
  assert.equal(weekdayOf("2026-10-14"), "wednesday");
  assert.ok(windowOverlapping(WINDOWS, "2026-10-14", 8 * 60, 8 * 60 + 30));
  assert.equal(windowOverlapping(WINDOWS, "2026-10-18", 8 * 60, 8 * 60 + 30), null);
});

test("a flexible block slides to the end of protected time", () => {
  const start = startOutsideProtected(8 * 60, 30, WINDOWS, "2026-10-14", 8 * 60, 22 * 60);
  assert.equal(start, 9 * 60);
  const evening = startOutsideProtected(18 * 60 + 45, 30, WINDOWS, "2026-10-14", 8 * 60, 22 * 60);
  assert.equal(evening, 20 * 60 + 30);
});
