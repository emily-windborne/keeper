import assert from "node:assert/strict";
import test from "node:test";
import { layoutWeekIcons } from "@/lib/planner/week-icons";

test("two tasks at the same time sit side by side", () => {
  const placed = layoutWeekIcons([
    { title: "Call", rangeStart: 600, rangeEnd: 630 },
    { title: "Mail", rangeStart: 600, rangeEnd: 630 },
  ]);
  assert.deepEqual(
    placed.map((row) => row.lane),
    [0, 1],
  );
  assert.equal(placed[0]?.extra, 0);
});

test("a third overlap becomes +N", () => {
  const placed = layoutWeekIcons([
    { title: "A", rangeStart: 660, rangeEnd: 690 },
    { title: "B", rangeStart: 660, rangeEnd: 720 },
    { title: "C", rangeStart: 690, rangeEnd: 720 },
  ]);
  assert.equal(placed.length, 2);
  assert.equal(placed[0]?.extra, 1);
});

test("tasks that do not overlap stay in one lane", () => {
  const placed = layoutWeekIcons([
    { title: "Morning", rangeStart: 420, rangeEnd: 450 },
    { title: "Evening", rangeStart: 1020, rangeEnd: 1080 },
  ]);
  assert.deepEqual(
    placed.map((row) => row.lane),
    [0, 0],
  );
});
