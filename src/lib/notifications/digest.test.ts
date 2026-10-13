import assert from "node:assert/strict";
import test from "node:test";
import {
  hasReachedLocalTime,
  morningDigestBody,
  orderedTitles,
  zonedClock,
} from "@/lib/notifications/digest";

test("the morning line names the count and the first task", () => {
  assert.equal(morningDigestBody(["Yoga", "Dishes", "Email", "Laundry"]), "Today: 4 things. Start with Yoga.");
  assert.equal(morningDigestBody(["Call the dentist"]), "Today: 1 thing. Start with Call the dentist.");
  assert.equal(morningDigestBody([]), "Today: nothing scheduled.");
});

test("the earliest timed task is the one to start with", () => {
  assert.deepEqual(
    orderedTitles([
      { title: "Email", start: "15:00" },
      { title: "Yoga", start: "07:45" },
      { title: "No time", start: null },
    ]),
    ["Yoga", "Email", "No time"],
  );
});

test("the morning note waits until the chosen time, then can still go out later", () => {
  assert.equal(hasReachedLocalTime(7 * 60 + 30, 7 * 60 + 30), true);
  assert.equal(hasReachedLocalTime(9 * 60, 7 * 60 + 30), true);
  assert.equal(hasReachedLocalTime(7 * 60 + 29, 7 * 60 + 30), false);
});

test("the clock is read in the saved timezone", () => {
  const clock = zonedClock(new Date("2026-10-13T14:30:00.000Z"), "America/Los_Angeles");
  assert.deepEqual(clock, { date: "2026-10-13", minutes: 7 * 60 + 30 });
});
