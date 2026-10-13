import type { Item } from "@/data/inventory-mock";
import type { BrainDumpItemDraft } from "@/lib/api/brain-dump-types";
import { frequencyTypeForInterval, intervalOf, type FrequencyUnit } from "@/lib/inventory/frequency";

const CATEGORIES = new Set<Item["category"]>([
  "Home",
  "Family",
  "Personal",
  "Work",
  "Upkeep",
  "Health",
]);

const TYPES = new Set<Item["type"]>(["recurring", "one_off", "goal"]);

const FREQ = new Set<Item["frequency_type"]>([
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "custom",
]);

const TOD = new Set<Item["preferred_time_of_day"]>([
  "morning",
  "afternoon",
  "evening",
  "anytime",
]);

const PRI = new Set<Item["priority"]>(["Critical", "Important", "Standard", "Optional"]);

const FLEX = new Set<Item["flexibility"]>(["Fixed", "Preferred window", "Flexible anytime"]);

const CAD = new Set<Item["cadence_pressure"]>([
  "Must stay on cadence",
  "Can slide a little",
  "Can defer",
]);

const DAY = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n * 100) / 100;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function parsePreferredDays(v: unknown): string[] | null {
  if (v == null) return null;
  if (Array.isArray(v)) {
    const out: string[] = [];
    for (const x of v) {
      if (typeof x !== "string") continue;
      const d = x.trim().toLowerCase();
      if (DAY.has(d)) out.push(d);
    }
    return out.length ? out : null;
  }
  if (typeof v === "string") {
    const parts = v.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const out = parts.filter((d) => DAY.has(d));
    return out.length ? out : null;
  }
  return null;
}

/**
 * Turn one model object into a valid inventory draft, or null if unusable.
 */
export function sanitizeBrainDumpItem(raw: unknown): BrainDumpItemDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = str(o.title);
  if (!title) return null;

  const category =
    typeof o.category === "string" && CATEGORIES.has(o.category as Item["category"])
      ? (o.category as Item["category"])
      : "Personal";

  const type =
    typeof o.type === "string" && TYPES.has(o.type as Item["type"])
      ? (o.type as Item["type"])
      : "recurring";

  let frequency_type: Item["frequency_type"] = null;
  let frequency_value: number | null = null;

  if (type === "one_off") {
    frequency_type = null;
    frequency_value = null;
  } else if (type === "recurring" || type === "goal") {
    const ft =
      typeof o.frequency_type === "string" && FREQ.has(o.frequency_type as Item["frequency_type"])
        ? (o.frequency_type as NonNullable<Item["frequency_type"]>)
        : "weekly";
    frequency_type = ft;
    frequency_value = num(o.frequency_value, 1);
    if (ft === "daily") frequency_value = 1;
  }

  const preferred_days = parsePreferredDays(o.preferred_days);
  const preferred_time_of_day =
    typeof o.preferred_time_of_day === "string" && TOD.has(o.preferred_time_of_day as Item["preferred_time_of_day"])
      ? (o.preferred_time_of_day as Item["preferred_time_of_day"])
      : null;

  const estimated_minutes = Math.min(24 * 60, Math.max(5, num(o.estimated_minutes, 30)));

  const priority =
    typeof o.priority === "string" && PRI.has(o.priority as Item["priority"])
      ? (o.priority as Item["priority"])
      : "Standard";

  const flexibility =
    typeof o.flexibility === "string" && FLEX.has(o.flexibility as Item["flexibility"])
      ? (o.flexibility as Item["flexibility"])
      : "Flexible anytime";

  const cadence_pressure =
    typeof o.cadence_pressure === "string" &&
    CAD.has(o.cadence_pressure as Item["cadence_pressure"])
      ? (o.cadence_pressure as Item["cadence_pressure"])
      : "Can slide a little";

  const minimum_success_threshold = str(o.minimum_success_threshold);
  const notes = str(o.notes);
  const statedUnit =
    o.frequency_unit === "days" || o.frequency_unit === "weeks" || o.frequency_unit === "months"
      ? (o.frequency_unit as FrequencyUnit)
      : null;
  const repeating = type === "recurring" || type === "goal";
  const interval = repeating
    ? intervalOf({
        frequency_type,
        frequency_value,
        frequency_unit: statedUnit,
      })
    : null;

  return {
    title,
    category,
    type,
    frequency_type: interval ? frequencyTypeForInterval(interval.unit, interval.every) : null,
    frequency_value: interval ? interval.every : null,
    frequency_unit: interval ? interval.unit : null,
    times_per_period: Math.min(14, Math.max(1, Math.round(num(o.times_per_period, 1)))),
    recurrence_end: "never",
    recurrence_end_date: null,
    recurrence_end_count: null,
    completed_count: 0,
    preferred_days,
    preferred_time_of_day,
    fixed_start_time:
      typeof o.fixed_start_time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.fixed_start_time)
        ? o.fixed_start_time
        : null,
    estimated_minutes,
    priority,
    flexibility,
    cadence_pressure,
    minimum_success_threshold,
    notes,
    is_archived: false,
    last_completed_at: null,
    next_due_date: null,
  };
}
