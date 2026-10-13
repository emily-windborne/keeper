import type { Item } from "@/data/inventory-mock";
import { addInterval, intervalOf, nextDueAfterCompletion } from "@/lib/inventory/frequency";

function toDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
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
  return nextDueAfterCompletion(item, completedAtISO);
}

type InitialDuePick = Pick<Item, "type" | "frequency_type" | "frequency_value" | "frequency_unit">;

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

  if (item.frequency_type == null && item.frequency_unit == null) return null;
  const { unit, every } = intervalOf(item);
  if (unit === "days" && every <= 1) return utcNoonISO(ref);
  return addInterval(ref, unit, every).toISOString();
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
