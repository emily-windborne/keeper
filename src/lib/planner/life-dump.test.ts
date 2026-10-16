import assert from "node:assert/strict";
import test from "node:test";
import {
  EMILY_WEEK_DUMP,
  addDaysISO,
  interpretLifeDump,
  leftoverLifeDump,
  resolveRelativeDate,
  resolveWeekday,
  scheduleLifeDump,
  validatePlacements,
  type LifeClock,
  type PlacedLife,
} from "@/lib/planner/life-dump";
import type { ProtectedWindow } from "@/lib/planner/protected-time";

const CLOCK: LifeClock = {
  todayISO: "2026-10-13",
  nowMinutes: 20 * 60 + 30,
  timeZone: "America/New_York",
  wakeMin: 8 * 60,
  windMin: 22 * 60,
};

function byTitle(rows: PlacedLife[], title: string): PlacedLife {
  const found = rows.find((row) => row.title === title);
  assert.ok(found, title);
  return found!;
}

test("Emily's note is fully understood, so nothing is left for the model", () => {
  assert.ok(leftoverLifeDump(EMILY_WEEK_DUMP, CLOCK).trim().length < 8);
});

test("tomorrow and this coming Sunday use the real current day", () => {
  assert.equal(resolveRelativeDate("tomorrow", "2026-10-13"), "2026-10-14");
  assert.equal(resolveWeekday("sunday", "2026-10-13", false), "2026-10-18");
  assert.equal(resolveRelativeDate("this coming Sunday", "2026-10-13"), "2026-10-18");
  assert.equal(addDaysISO("2026-10-13", 1), "2026-10-14");
});

test("Emily's Tuesday note keeps the craft afternoon fixed on Sunday", () => {
  const rows = scheduleLifeDump(EMILY_WEEK_DUMP, CLOCK);
  const crafts = byTitle(rows, "Girls crafts");
  assert.equal(crafts.dateISO, "2026-10-18");
  assert.equal(crafts.startMin, 14 * 60);
  assert.equal(crafts.endMin, 17 * 60);
  assert.equal(crafts.durationMin, 180);
  assert.equal(crafts.stated, true);
});

test("tomorrow's calls and meetings stay at the times she named", () => {
  const rows = scheduleLifeDump(EMILY_WEEK_DUMP, CLOCK);
  const video = byTitle(rows, "Video call");
  assert.equal(video.dateISO, "2026-10-14");
  assert.equal(video.startMin, 10 * 60);
  assert.equal(video.endMin, 11 * 60);
  assert.equal(video.inPerson, false);

  const meetings = rows.filter((row) => /meeting in jupiter/i.test(row.title));
  assert.equal(meetings.length, 2);
  assert.equal(meetings[0]?.startMin, 11 * 60);
  assert.equal(meetings[0]?.endMin, 11 * 60 + 30);
  assert.equal(meetings[1]?.startMin, 11 * 60 + 30);
  assert.equal(meetings[1]?.dateISO, "2026-10-14");
  assert.equal(meetings.every((row) => row.inPerson), true);
});

test("errands stay in business hours, in order, and off her meetings", () => {
  const rows = scheduleLifeDump(EMILY_WEEK_DUMP, CLOCK);
  const glasses = byTitle(rows, "Pick up mom's eyeglasses");
  const smoke = byTitle(rows, "Smoke shop");
  const ups = byTitle(rows, "Ship package at UPS");
  const coolant = byTitle(rows, "Get coolant");
  const errands = [glasses, smoke, ups, coolant];

  for (const row of errands) {
    assert.ok(row.startMin >= 9 * 60, row.title);
    assert.ok(row.endMin <= 17 * 60, row.title);
    assert.ok(row.startMin >= 8 * 60 && row.endMin <= 22 * 60, row.title);
    assert.notEqual(row.dateISO, "2026-10-13");
  }

  assert.equal(glasses.dateISO, smoke.dateISO);
  assert.equal(smoke.dateISO, ups.dateISO);
  assert.ok(smoke.startMin >= glasses.endMin);
  assert.ok(ups.startMin >= smoke.endMin);
  assert.ok(glasses.endMin <= 17 * 60);

  const meetings = rows.filter((row) => row.stated && row.dateISO === glasses.dateISO);
  for (const errand of errands.filter((row) => row.dateISO === glasses.dateISO)) {
    for (const meeting of meetings) {
      const overlaps = errand.startMin < meeting.endMin && errand.endMin > meeting.startMin;
      assert.equal(overlaps, false, errand.title);
    }
  }
});

test("once I've done that, the next stop comes later the same day", () => {
  const rows = scheduleLifeDump(
    "drop the package at UPS tomorrow; once I've done that, pick up groceries at the store.",
    CLOCK,
  );
  const ups = byTitle(rows, "Ship package at UPS");
  const groceries = byTitle(rows, "Pick up groceries at the store");
  assert.equal(groceries.dateISO, ups.dateISO);
  assert.ok(groceries.startMin >= ups.endMin);
  assert.ok(groceries.endMin <= 17 * 60);
});

test("before I go to Y stays earlier that day", () => {
  const rows = scheduleLifeDump(
    "buy a card at the store before I go to the post office; go to the post office tomorrow at 3 PM.",
    CLOCK,
  );
  const card = byTitle(rows, "Buy a card at the store");
  const office = byTitle(rows, "Go to the post office");
  assert.equal(office.dateISO, "2026-10-14");
  assert.equal(office.startMin, 15 * 60);
  assert.equal(card.dateISO, office.dateISO);
  assert.ok(card.endMin <= office.startMin);
  assert.ok(card.startMin >= 9 * 60);
});

test("on the way back stays on the same trip", () => {
  const rows = scheduleLifeDump(
    "drive to Stuart to pick up mom's eyeglasses tomorrow; on the way back, stop at UPS.",
    CLOCK,
  );
  const glasses = byTitle(rows, "Pick up mom's eyeglasses");
  const ups = byTitle(rows, "Ship package at UPS");
  assert.equal(ups.dateISO, glasses.dateISO);
  assert.ok(ups.startMin >= glasses.endMin);
  assert.ok(ups.endMin <= 17 * 60);
});

test("a 10 PM errand is rejected and put back inside business hours", () => {
  const intents = interpretLifeDump(EMILY_WEEK_DUMP, CLOCK);
  const ups = intents.find((row) => row.title === "Ship package at UPS");
  assert.ok(ups);
  const bad = scheduleLifeDump(EMILY_WEEK_DUMP, CLOCK).map((row) =>
    row.title === "Ship package at UPS"
      ? { ...row, dateISO: "2026-10-14", startMin: 22 * 60, endMin: 22 * 60 + 30 }
      : row,
  );
  const checked = validatePlacements(bad, intents, CLOCK);
  assert.ok(checked.problems.some((problem) => problem.title === "Ship package at UPS"));
  const fixed = checked.fixed.find((row) => row.title === "Ship package at UPS");
  assert.ok(fixed);
  assert.ok(fixed.startMin >= 9 * 60 && fixed.endMin <= 17 * 60);
  assert.ok(fixed.startMin >= 8 * 60 && fixed.endMin <= 22 * 60);
});

const PROTECTED: ProtectedWindow[] = [
  {
    id: "school",
    name: "Morning school run",
    days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    startMin: 7 * 60 + 30,
    endMin: 9 * 60,
  },
  {
    id: "dinner",
    name: "Dinner & bedtime",
    days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    startMin: 18 * 60 + 30,
    endMin: 20 * 60 + 30,
  },
];

test("a named evening meeting can sit inside protected time", () => {
  const rows = scheduleLifeDump("meeting tomorrow at 7 PM.", { ...CLOCK, protectedWindows: PROTECTED });
  const meeting = rows.find((row) => row.stated);
  assert.ok(meeting);
  assert.equal(meeting.dateISO, "2026-10-14");
  assert.equal(meeting.startMin, 19 * 60);
});

test("a flexible errand stays out of protected time, and a planted one is moved", () => {
  const clock = {
    ...CLOCK,
    protectedWindows: [
      ...PROTECTED,
      {
        id: "lunch",
        name: "Lunch",
        days: ["wednesday"],
        startMin: 12 * 60,
        endMin: 13 * 60,
      },
    ],
  };
  const rows = scheduleLifeDump("fold the laundry tomorrow.", clock);
  const laundry = rows[0];
  assert.ok(laundry);
  assert.ok(!(laundry.startMin < 13 * 60 && laundry.endMin > 12 * 60));
  const intents = interpretLifeDump(EMILY_WEEK_DUMP, clock);
  const bad = scheduleLifeDump(EMILY_WEEK_DUMP, clock).map((row) =>
    row.title === "Ship package at UPS"
      ? { ...row, dateISO: "2026-10-14", startMin: 19 * 60, endMin: 19 * 60 + 30 }
      : row,
  );
  const checked = validatePlacements(bad, intents, clock);
  assert.ok(checked.problems.some((problem) => problem.reason.includes("Dinner")));
  const fixed = checked.fixed.find((row) => row.title === "Ship package at UPS");
  assert.ok(fixed);
  const insideDinner = fixed.startMin < 20 * 60 + 30 && fixed.endMin > 18 * 60 + 30;
  assert.equal(insideDinner, false);
});
