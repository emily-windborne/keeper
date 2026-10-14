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
  assert.equal(placed[0]?.lanes, 2);
  assert.equal(placed[0]?.extra, 0);
});

test("three tasks at the same time share the column", () => {
  const placed = layoutWeekIcons([
    { title: "A", rangeStart: 600, rangeEnd: 660 },
    { title: "B", rangeStart: 600, rangeEnd: 660 },
    { title: "C", rangeStart: 600, rangeEnd: 660 },
  ]);
  assert.deepEqual(
    placed.map((row) => row.title),
    ["A", "B", "C"],
  );
  assert.deepEqual(
    placed.map((row) => row.lane),
    [0, 1, 2],
  );
  assert.equal(placed[0]?.lanes, 3);
  assert.equal(placed[0]?.extra, 0);
});

test("more than three at once keep the first two and a count", () => {
  const placed = layoutWeekIcons([
    { title: "Crafts", rangeStart: 840, rangeEnd: 900 },
    { title: "Glasses", rangeStart: 840, rangeEnd: 870 },
    { title: "Coolant", rangeStart: 840, rangeEnd: 870 },
    { title: "Package", rangeStart: 840, rangeEnd: 855 },
  ]);
  assert.deepEqual(
    placed.map((row) => row.title),
    ["Coolant", "Crafts"],
  );
  assert.deepEqual(
    placed.map((row) => row.lane),
    [0, 1],
  );
  assert.equal(placed[0]?.extra, 2);
  assert.equal(placed[1]?.extra, 0);
});

test("a chain that is only two wide stays fully visible", () => {
  const placed = layoutWeekIcons([
    { title: "A", rangeStart: 660, rangeEnd: 690 },
    { title: "B", rangeStart: 660, rangeEnd: 720 },
    { title: "C", rangeStart: 690, rangeEnd: 720 },
  ]);
  assert.deepEqual(
    placed.map((row) => row.title),
    ["A", "B", "C"],
  );
  assert.equal(placed[0]?.lane, 0);
  assert.equal(placed[1]?.lane, 1);
  assert.equal(placed[2]?.lane, 0);
  assert.equal(placed[0]?.extra, 0);
});

test("tasks that do not overlap stay in one lane", () => {
  const placed = layoutWeekIcons([
    { title: "Morning", rangeStart: 420, rangeEnd: 450 },
    { title: "Evening", rangeStart: 1020, rangeEnd: 1080 },
  ]);
  assert.deepEqual(
    placed.map((row) => ({ lane: row.lane, lanes: row.lanes })),
    [
      { lane: 0, lanes: 1 },
      { lane: 0, lanes: 1 },
    ],
  );
});
