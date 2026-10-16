import type { ItemCategory } from "@/data/inventory-mock";
import type { BrainDumpItemDraft } from "@/lib/api/brain-dump-types";
import { sanitizeBrainDumpItem } from "@/lib/inventory/brain-dump-sanitize";
import {
  resolveRelativeDate,
  resolveWeekday,
  type LifeClock,
} from "@/lib/planner/life-dump";
import { startOutsideProtected, windowsOnDate } from "@/lib/planner/protected-time";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const EARLIEST_MIN = 7 * 60;
const LATEST_MIN = 22 * 60;

function minutesToHHMM(total: number): string {
  const clamped = Math.min(24 * 60 - 1, Math.max(0, Math.round(total)));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function splitSpoken(text: string): string[] {
  return text
    .split(/[;\n]+/)
    .map((part) => part.trim().replace(/^\W+|\W+$/g, ""))
    .filter((part) => part.length >= 3);
}

function shortTitle(clause: string): string {
  const title = clause
    .replace(/^\s*(?:please\s+)?(?:i(?:'d| would)?\s+(?:like|want)\s+to\s+)?(?:add|create|make|schedule)\s+(?:a|an|the)?\s*/i, "")
    .replace(/^(?:a\s+)?(?:routine|recurring(?:\s+(?:event|task))?|one-?off|event|task|habit)\s+(?:which|that)\s+is\s+/i, "")
    .replace(/\b(?:every|each)\s+(?:other\s+)?(?:day|week|month|weekday|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, " ")
    .replace(/\b(?:on\s+)?(?:this\s+coming\s+|next\s+|coming\s+|this\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, " ")
    .replace(/\b(?:in the\s+|on\s+)?(?:morning|afternoon|evening|night)s?\b/gi, " ")
    .replace(/\b(?:routines?|recurring|one-?off|which is|that is|please)\b/gi, " ")
    .replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi, " ")
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\b/gi, " ")
    .replace(/\bfor\s+\d+(?:\.\d+)?\s*(?:min(?:ute)?s?|hours?)\b/gi, " ")
    .replace(/[,.;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return "New item";
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function kindOf(clause: string): "anchor" | "recurring" | "one_off" {
  if (/\broutines?\b/i.test(clause)) return "anchor";
  if (/\b(every|each|recurring|weekly|daily|monthly)\b/i.test(clause)) return "recurring";
  return "one_off";
}

function daysOf(clause: string): string[] {
  return WEEKDAYS.filter((day) => new RegExp(`\\b${day}\\b`, "i").test(clause));
}

function durationOf(clause: string): number {
  const minutes = clause.match(/\b(\d+)\s*(?:min(?:ute)?s?)\b/i);
  if (minutes) return Math.min(24 * 60, Math.max(5, Number(minutes[1])));
  const hours = clause.match(/\b(\d+(?:\.\d+)?)\s*hours?\b/i);
  if (hours) return Math.min(24 * 60, Math.max(5, Math.round(Number(hours[1]) * 60)));
  if (/\b(drops|pills|vitamin|meds|medicine)\b/i.test(clause)) return 15;
  return 30;
}

function categoryOf(clause: string): ItemCategory {
  if (/\b(kid|kids|school|family|mom|dad|brother|sister|girl|boy)\b/i.test(clause)) return "Family";
  if (/\b(work|meeting|email|office)\b/i.test(clause)) return "Work";
  if (/\b(laundry|clean|dishes|house|home|grocer)\b/i.test(clause)) return "Home";
  if (/\b(doctor|workout|gym|yoga|vitamin|medicine|health|run)\b/i.test(clause)) return "Health";
  if (/\b(car|ups|repair|oil|fix)\b/i.test(clause)) return "Upkeep";
  return "Personal";
}

export function namedClockMinutes(clause: string): number | null {
  const match =
    clause.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i) ??
    clause.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/i);
  if (!match) return null;
  const mer = (match[3] ?? "").toLowerCase().replace(/\./g, "");
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (mer === "pm" && hour < 12) hour += 12;
  if (mer === "am" && hour === 12) hour = 0;
  if (!mer && hour >= 1 && hour <= 7) hour += 12;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function vagueKind(clause: string): "morning" | "afternoon" | "evening" | null {
  if (/\bmorning\b/i.test(clause)) return "morning";
  if (/\bafternoon\b/i.test(clause)) return "afternoon";
  if (/\bevening\b|\bnight\b/i.test(clause)) return "evening";
  return null;
}

function vagueStart(
  kind: "morning" | "afternoon" | "evening",
  dateISO: string,
  duration: number,
  clock: LifeClock,
): number {
  const windows = clock.protectedWindows ?? [];
  const dayWindows = windowsOnDate(windows, dateISO);
  let seed = kind === "morning" ? 8 * 60 : kind === "afternoon" ? 13 * 60 : 18 * 60;
  if (kind === "morning") {
    const block = dayWindows.find((window) => window.startMin < 10 * 60 && window.endMin > EARLIEST_MIN);
    if (block) seed = Math.max(seed, block.endMin);
  }
  if (kind === "evening") {
    const block = dayWindows.find((window) => window.startMin >= 16 * 60 && window.endMin <= LATEST_MIN);
    if (block) seed = Math.max(seed, block.endMin);
  }
  seed = Math.max(EARLIEST_MIN, seed);
  const snapped = startOutsideProtected(seed, duration, windows, dateISO, EARLIEST_MIN, LATEST_MIN);
  return Math.max(EARLIEST_MIN, snapped);
}

function dueFor(clause: string, days: string[], clock: LifeClock): string | null {
  const named = resolveRelativeDate(clause, clock.todayISO);
  if (named) return named;
  if (days.length === 1) return resolveWeekday(days[0], clock.todayISO, false);
  return clock.todayISO;
}

function draftFromClause(clause: string, clock: LifeClock): BrainDumpItemDraft | null {
  const type = kindOf(clause);
  const days = daysOf(clause);
  const duration = durationOf(clause);
  const dateISO = dueFor(clause, days, clock) ?? clock.todayISO;
  const clockMin = namedClockMinutes(clause);
  const vague = clockMin == null ? vagueKind(clause) : null;
  const startMin = clockMin ?? (vague ? vagueStart(vague, dateISO, duration, clock) : null);
  const daily = /\b(every|each)\s+day\b|\bdaily\b/i.test(clause);
  const repeating = type === "anchor" || type === "recurring";
  const sanitized = sanitizeBrainDumpItem({
    title: shortTitle(clause),
    category: categoryOf(clause),
    type,
    frequency_type: repeating ? (daily ? "daily" : "weekly") : "none",
    frequency_value: repeating ? 1 : 0,
    frequency_unit: repeating ? (daily ? "days" : "weeks") : "none",
    preferred_days: repeating && days.length > 0 && !daily ? days : [],
    preferred_time_of_day: vague ?? "none",
    estimated_minutes: duration,
    priority: "Standard",
    flexibility: startMin == null ? "Flexible anytime" : "Fixed",
    cadence_pressure: "Can slide a little",
    minimum_success_threshold: "",
    notes: "",
    fixed_start_time: startMin == null ? "" : minutesToHHMM(startMin),
    next_due_date: dateISO,
    times_per_period: 1,
  });
  return sanitized;
}

/** Local reading of a spoken or typed note when the model is unavailable. */
export function parseSpokenIntent(text: string, clock: LifeClock): BrainDumpItemDraft[] {
  const items: BrainDumpItemDraft[] = [];
  for (const clause of splitSpoken(text)) {
    const draft = draftFromClause(clause, clock);
    if (draft) items.push(draft);
  }
  return items;
}

function titleLooksRaw(title: string): boolean {
  return title.length > 48 || /\b(i want to|which is|routine which)\b/i.test(title);
}

/**
 * Keep a good model reading. Replace a pasted sentence, a routine marked as a one-off,
 * or a vague time that landed inside protected hours.
 */
export function correctSpokenDraft(
  source: string,
  draft: BrainDumpItemDraft,
  spoken: BrainDumpItemDraft | null,
): BrainDumpItemDraft {
  if (!spoken) return draft;
  let next = draft;
  if (titleLooksRaw(draft.title)) next = { ...next, title: spoken.title };
  const wantsRepeat = /\b(routines?|every|each|recurring)\b/i.test(source);
  if (wantsRepeat && draft.type === "one_off") {
    return {
      ...next,
      type: spoken.type,
      category: spoken.category,
      frequency_type: spoken.frequency_type,
      frequency_value: spoken.frequency_value,
      frequency_unit: spoken.frequency_unit,
      preferred_days: spoken.preferred_days,
      preferred_time_of_day: spoken.preferred_time_of_day,
      fixed_start_time: spoken.fixed_start_time,
      estimated_minutes: spoken.estimated_minutes,
      flexibility: spoken.flexibility,
      next_due_date: spoken.next_due_date,
    };
  }
  if (namedClockMinutes(source) == null && spoken.fixed_start_time) {
    next = {
      ...next,
      fixed_start_time: spoken.fixed_start_time,
      estimated_minutes: spoken.estimated_minutes,
    };
  }
  return next;
}

export function withSpokenFallback(
  source: string,
  modelItems: BrainDumpItemDraft[],
  clock: LifeClock,
): BrainDumpItemDraft[] {
  const spoken = parseSpokenIntent(source, clock);
  if (modelItems.length === 0) return spoken;
  return modelItems.map((item, index) => correctSpokenDraft(source, item, spoken[index] ?? spoken[0] ?? null));
}
