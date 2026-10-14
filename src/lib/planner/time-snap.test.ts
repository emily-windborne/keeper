import assert from "node:assert/strict";
import test from "node:test";
import {
  dayOffsetFromDelta,
  minutesFromPointerY,
  minutesToHHMM,
  resizeBlock,
  shiftBlock,
  snapMinutes,
  TIMELINE_END_MIN,
  TIMELINE_START_MIN,
} from "@/lib/planner/time-snap";

test("times snap to 15 minutes", () => {
  assert.equal(snapMinutes(8), 15);
  assert.equal(snapMinutes(7), 0);
  assert.equal(snapMinutes(22), 15);
  assert.equal(snapMinutes(23), 30);
});

test("moving a block keeps its length and stays inside the day", () => {
  const moved = shiftBlock({
    startMin: 9 * 60,
    endMin: 10 * 60,
    deltaMinutes: 20,
    minStart: TIMELINE_START_MIN,
    maxEnd: TIMELINE_END_MIN,
  });
  assert.equal(moved.startMin, 9 * 60 + 15);
  assert.equal(moved.endMin - moved.startMin, 60);

  const early = shiftBlock({
    startMin: 7 * 60,
    endMin: 8 * 60,
    deltaMinutes: -40,
    minStart: TIMELINE_START_MIN,
    maxEnd: TIMELINE_END_MIN,
  });
  assert.equal(early.startMin, TIMELINE_START_MIN);
  assert.equal(early.endMin, 8 * 60);
});

test("resizing changes the end and will not shrink below 15 minutes", () => {
  const longer = resizeBlock({
    startMin: 13 * 60,
    endMin: 14 * 60,
    deltaMinutes: 20,
    maxEnd: TIMELINE_END_MIN,
  });
  assert.equal(longer.startMin, 13 * 60);
  assert.equal(longer.endMin, 14 * 60 + 15);

  const tiny = resizeBlock({
    startMin: 13 * 60,
    endMin: 14 * 60,
    deltaMinutes: -90,
    maxEnd: TIMELINE_END_MIN,
  });
  assert.equal(tiny.endMin - tiny.startMin, 15);
});

test("a tap on the grid becomes a 15-minute time", () => {
  const minutes = minutesFromPointerY(48, 17 * 48, TIMELINE_START_MIN, TIMELINE_END_MIN);
  assert.equal(minutesToHHMM(minutes), "08:00");
  assert.equal(dayOffsetFromDelta(50, 48), 1);
  assert.equal(dayOffsetFromDelta(10, 0), 0);
});
