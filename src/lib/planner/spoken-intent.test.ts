import assert from "node:assert/strict";
import test from "node:test";
import type { BrainDumpItemDraft } from "@/lib/api/brain-dump-types";
import { leftoverLifeDump, scheduleLifeDump, type LifeClock } from "@/lib/planner/life-dump";
import type { ProtectedWindow } from "@/lib/planner/protected-time";
import { correctSpokenDraft, parseSpokenIntent } from "@/lib/planner/spoken-intent";

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

const FRIDAY: LifeClock = {
  todayISO: "2026-10-16",
  nowMinutes: 10 * 60,
  timeZone: "America/New_York",
  protectedWindows: PROTECTED,
};

test("a spoken routine becomes a short Friday morning routine after the school run", () => {
  const text = "I want to add a routine which is Friday morning tanning drops";
  assert.equal(scheduleLifeDump(text, FRIDAY).length, 0);
  assert.equal(leftoverLifeDump(text, FRIDAY), text);
  const [item] = parseSpokenIntent(text, FRIDAY);
  assert.ok(item);
  assert.equal(item.title, "Tanning drops");
  assert.equal(item.type, "anchor");
  assert.deepEqual(item.preferred_days, ["friday"]);
  assert.equal(item.frequency_type, "weekly");
  assert.equal(item.fixed_start_time, "09:00");
  assert.equal(item.estimated_minutes, 15);
  assert.equal(item.category, "Personal");
  assert.equal(item.next_due_date?.slice(0, 10), "2026-10-16");
});

test("every Friday is recurring, and a named evening clock can sit in protected time", () => {
  const [item] = parseSpokenIntent("every Friday at 7:00 PM family call", FRIDAY);
  assert.ok(item);
  assert.equal(item.title, "Family call");
  assert.equal(item.type, "recurring");
  assert.notEqual(item.type, "one_off");
  assert.deepEqual(item.preferred_days, ["friday"]);
  assert.equal(item.fixed_start_time, "19:00");
  assert.equal(item.category, "Family");
});

test("a vague evening starts after dinner", () => {
  const [item] = parseSpokenIntent("evening stretch every Friday", FRIDAY);
  assert.equal(item?.fixed_start_time, "20:30");
  assert.equal(item?.type, "recurring");
});

test("a pasted sentence from the model is replaced with the short reading", () => {
  const source = "I want to add a routine which is Friday morning tanning drops";
  const [spoken] = parseSpokenIntent(source, FRIDAY);
  const model = {
    ...spoken,
    title: source,
    type: "one_off",
    frequency_type: null,
    frequency_value: null,
    frequency_unit: null,
    preferred_days: null,
    fixed_start_time: "09:00",
  } as BrainDumpItemDraft;
  const fixed = correctSpokenDraft(source, model, spoken);
  assert.equal(fixed.title, "Tanning drops");
  assert.equal(fixed.type, "anchor");
  assert.equal(fixed.fixed_start_time, "09:00");
});
