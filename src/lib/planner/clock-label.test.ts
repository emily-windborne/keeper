import assert from "node:assert/strict";
import test from "node:test";
import { formatClock, formatClockRange, formatClocksInText, formatDayAndRange } from "@/lib/planner/clock-label";

test("afternoon times use 12-hour labels", () => {
  assert.equal(formatClock("17:20"), "5:20 PM");
  assert.equal(formatClock("18:05"), "6:05 PM");
  assert.equal(formatClock("17:00:00"), "5:00 PM");
  assert.equal(formatClockRange("17:20", "18:05"), "5:20 – 6:05 PM");
  assert.equal(formatClockRange("17:00", "17:30"), "5:00 – 5:30 PM");
});

test("a range that crosses noon keeps both meridiems", () => {
  assert.equal(formatClockRange("11:30", "13:00"), "11:30 AM – 1:00 PM");
  assert.equal(formatClock("00:15"), "12:15 AM");
  assert.equal(formatClock("12:00"), "12:00 PM");
});

test("a resolved day and range reads like the review sheet", () => {
  assert.equal(formatDayAndRange("2026-10-18", "14:00", "17:00"), "Sun, Oct 18 · 2:00 – 5:00 PM");
});

test("notes and previews do not keep 24-hour clocks", () => {
  assert.equal(
    formatClocksInText("Already on the calendar for Sunday at 17:20 to 18:05."),
    "Already on the calendar for Sunday at 5:20 – 6:05 PM.",
  );
  assert.equal(formatClocksInText("Meet at 21:39."), "Meet at 9:39 PM.");
  assert.equal(formatClocksInText("Wed, Oct 14, 17:00 to 17:30"), "Wed, Oct 14, 5:00 – 5:30 PM");
});
