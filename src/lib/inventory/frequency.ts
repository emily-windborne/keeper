import type { FrequencyType, Item } from "@/data/inventory-mock";

export type FrequencyUnit = "days" | "weeks" | "months";
export type RecurrenceEnd = "never" | "on_date" | "after_count";

const MS_PER_DAY = 86400000;

export function clampEvery(value: number | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(365, Math.round(n * 10) / 10);
}

/** Read the repeat rule, including rows saved before frequency_unit existed. */
export function intervalOf(item: Pick<Item, "frequency_type" | "frequency_value" | "frequency_unit">): {
  unit: FrequencyUnit;
  every: number;
} {
  if (item.frequency_unit === "days" || item.frequency_unit === "weeks" || item.frequency_unit === "months") {
    return { unit: item.frequency_unit, every: clampEvery(item.frequency_value) };
  }
  const every = clampEvery(item.frequency_value);
  switch (item.frequency_type) {
    case "daily":
      return { unit: "days", every };
    case "weekly":
      return { unit: "weeks", every };
    case "biweekly":
      return { unit: "weeks", every: clampEvery(every * 2) };
    case "monthly":
    case "custom":
      return { unit: "months", every };
    default:
      return { unit: "weeks", every: 1 };
  }
}

export function frequencyTypeForInterval(unit: FrequencyUnit, every: number): FrequencyType {
  if (unit === "days" && every === 1) return "daily";
  if (unit === "weeks" && every === 1) return "weekly";
  if (unit === "weeks" && every === 2) return "biweekly";
  if (unit === "months" && every === 1) return "monthly";
  return "custom";
}

export function addInterval(from: Date, unit: FrequencyUnit, every: number): Date {
  const step = clampEvery(every);
  if (unit === "days") {
    return new Date(from.getTime() + step * MS_PER_DAY);
  }
  if (unit === "weeks") {
    return new Date(from.getTime() + step * 7 * MS_PER_DAY);
  }
  const whole = Math.floor(step);
  const frac = step - whole;
  const out = new Date(from.getTime());
  if (whole > 0) out.setUTCMonth(out.getUTCMonth() + whole);
  if (frac > 1e-9) out.setTime(out.getTime() + Math.round(frac * 30.437 * MS_PER_DAY));
  return out;
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Next due after a completion. Returns null when the repeat has ended.
 * Notes are not part of this calculation.
 */
export function nextDueAfterCompletion(
  item: Pick<
    Item,
    | "frequency_type"
    | "frequency_value"
    | "frequency_unit"
    | "recurrence_end"
    | "recurrence_end_date"
    | "recurrence_end_count"
    | "completed_count"
  >,
  completedAtISO: string,
): string | null {
  const completed = new Date(completedAtISO);
  if (!Number.isFinite(completed.getTime())) return null;

  const doneCount = (item.completed_count ?? 0) + 1;
  if (item.recurrence_end === "after_count") {
    const limit = item.recurrence_end_count ?? 0;
    if (limit > 0 && doneCount >= limit) return null;
  }

  const { unit, every } = intervalOf(item);
  const next = addInterval(completed, unit, every);
  if (item.recurrence_end === "on_date" && item.recurrence_end_date) {
    if (dateOnly(next.toISOString()) > item.recurrence_end_date.slice(0, 10)) return null;
  }
  return next.toISOString();
}

export function repeatsEveryDay(item: Pick<Item, "frequency_type" | "frequency_value" | "frequency_unit">): boolean {
  const { unit, every } = intervalOf(item);
  return unit === "days" && every <= 1;
}
