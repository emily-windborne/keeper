import assert from "node:assert/strict";
import test from "node:test";
import { monthPillsForDay } from "@/lib/planner/month-pills";

test("a day keeps the earliest three titles and counts the rest", () => {
  const laid = monthPillsForDay([
    { id: "late", title: "Peloton", start: "17:00", category: "Health" },
    { id: "b", title: "Second meeting", start: "11:30", category: "Work" },
    { id: "a", title: "Meeting in Jupiter", start: "11:00", category: "Work" },
    { id: "call", title: "Video call", start: "10:00", category: "Work" },
    { id: "skin", title: "Skincare", start: "07:30", category: "Personal" },
  ]);
  assert.deepEqual(
    laid.pills.map((pill) => pill.title),
    ["Skincare", "Video call", "Meeting in Jupiter"],
  );
  assert.equal(laid.extra, 2);
});

test("tasks without a time sit after timed ones", () => {
  const laid = monthPillsForDay([
    { id: "loose", title: "Mail the form", start: null, category: "Home" },
    { id: "noon", title: "Lunch", start: "12:00", category: "Home" },
  ]);
  assert.deepEqual(
    laid.pills.map((pill) => pill.title),
    ["Lunch", "Mail the form"],
  );
  assert.equal(laid.extra, 0);
});

test("an empty day has no pills", () => {
  assert.deepEqual(monthPillsForDay([]), { pills: [], extra: 0 });
});
