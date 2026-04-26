import type { Item } from "@/data/inventory-mock";

const MS_PER_DAY = 86400000;
/** Average days per month (Gregorian) for fractional month offsets. */
const AVG_DAYS_PER_MONTH = 30.437;

function toDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

/**
 * Advance by a number of calendar months (whole part) plus fractional remainder in average days.
 * Used for `monthly` (frequency_value = number of months) and `custom` (frequency_value = months, may be fractional).
 */
function addMonthsFromValue(d: Date, monthsTotal: number): Date {
  if (!Number.isFinite(monthsTotal) || monthsTotal <= 0) {
    return addDays(d, 30);
  }
  const whole = Math.floor(monthsTotal);
  const frac = monthsTotal - whole;
  const out = new Date(d.getTime());
  if (whole > 0) {
    out.setUTCMonth(out.getUTCMonth() + whole);
  }
  if (frac > 1e-9) {
    out.setTime(out.getTime() + Math.round(frac * AVG_DAYS_PER_MONTH * MS_PER_DAY));
  }
  return out;
}

/** Calendar day of `d` at UTC noon as ISO string (stable for date-only semantics). */
function utcNoonISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return new Date(Date.UTC(y, m, day, 12, 0, 0, 0)).toISOString();
}

/**
 * Next due after completing a recurring item at `completedAtISO`.
 * - monthly: `frequency_value` is the number of months until the next due (e.g. 3 → +3 months).
 * - custom: `frequency_value` is months (e.g. 1.5 → +1.5 months).
 * - weekly / biweekly: interval is `frequency_value` periods (7 or 14 days each), defaulting to 1.
 * - daily: next calendar day after completion.
 */
export function computeNextDueDate(item: Item, completedAtISO: string): string | null {
  const completedAt = toDate(completedAtISO);
  if (!completedAt) return null;

  const v = item.frequency_value ?? 1;
  const ft = item.frequency_type;

  if (ft === "daily") {
    const days = Math.max(1, Math.round(Number.isFinite(v) ? v : 1));
    return addDays(completedAt, days).toISOString();
  }
  if (ft === "weekly") {
    const periods = Math.max(1, Number.isFinite(v) ? v : 1);
    return addDays(completedAt, 7 * periods).toISOString();
  }
  if (ft === "biweekly") {
    const periods = Math.max(1, Number.isFinite(v) ? v : 1);
    return addDays(completedAt, 14 * periods).toISOString();
  }
  if (ft === "monthly") {
    const months = Math.max(0.25, Number.isFinite(v) ? v : 1);
    return addMonthsFromValue(completedAt, months).toISOString();
  }
  if (ft === "custom") {
    const months = Math.max(0.25, Number.isFinite(v) ? v : 1);
    return addMonthsFromValue(completedAt, months).toISOString();
  }

  return null;
}

type InitialDuePick = Pick<Item, "type" | "frequency_type" | "frequency_value">;

/**
 * First `next_due_date` when none is set yet (new or first save with null).
 * - daily: today (UTC calendar day of reference)
 * - weekly: +7 days
 * - biweekly: +14 days
 * - monthly: +30 days
 * - custom: +`frequency_value` months (fractional allowed)
 */
export function computeInitialNextDueDate(item: InitialDuePick, referenceAtISO: string): string | null {
  if (item.type !== "recurring" && item.type !== "goal") return null;
  const ref = toDate(referenceAtISO);
  if (!ref) return null;

  const ft = item.frequency_type;
  if (ft == null) return null;

  const fv = item.frequency_value ?? 1;

  if (ft === "daily") {
    return utcNoonISO(ref);
  }
  if (ft === "weekly") {
    return addDays(ref, 7).toISOString();
  }
  if (ft === "biweekly") {
    return addDays(ref, 14).toISOString();
  }
  if (ft === "monthly") {
    return addDays(ref, 30).toISOString();
  }
  if (ft === "custom") {
    const months = Math.max(0.25, Number.isFinite(fv) ? fv : 1);
    return addMonthsFromValue(ref, months).toISOString();
  }

  return null;
}

/** Apply initial next due when inserting an item if it is recurring/goal, has cadence, and due is unset. */
export function withInitialNextDueDateIfNeeded(
  item: Omit<Item, "id" | "created_at" | "updated_at">,
  referenceAtISO: string,
): Omit<Item, "id" | "created_at" | "updated_at"> {
  if (item.next_due_date != null) return item;
  if (item.type !== "recurring" && item.type !== "goal") return item;
  if (item.frequency_type == null) return item;
  const next = computeInitialNextDueDate(item, referenceAtISO);
  if (!next) return item;
  return { ...item, next_due_date: next };
}
