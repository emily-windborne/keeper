import assert from "node:assert/strict";
import test from "node:test";
import {
  isMorningSendTime,
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

test("the morning note goes out near the saved local time, including an early winter run", () => {
  assert.equal(isMorningSendTime(7 * 60 + 30, 7 * 60 + 30), true);
  assert.equal(isMorningSendTime(6 * 60 + 30, 7 * 60 + 30), true);
  assert.equal(isMorningSendTime(6 * 60, 7 * 60 + 30), true);
  assert.equal(isMorningSendTime(5 * 60 + 59, 7 * 60 + 30), false);
  assert.equal(isMorningSendTime(4 * 60 + 30, 7 * 60 + 30), false);
});

test("the clock is read in the saved timezone", () => {
  assert.deepEqual(zonedClock(new Date("2026-10-13T11:30:00.000Z"), "America/New_York"), {
    date: "2026-10-13",
    minutes: 7 * 60 + 30,
  });
  assert.deepEqual(zonedClock(new Date("2027-01-13T11:30:00.000Z"), "America/New_York"), {
    date: "2027-01-13",
    minutes: 6 * 60 + 30,
  });
});
