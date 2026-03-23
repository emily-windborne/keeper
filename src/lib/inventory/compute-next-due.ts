import type { Item } from "@/data/inventory-mock";

/** Next due timestamp after completing a recurring item at `completedAtISO`. */
export function computeNextDueDate(item: Item, completedAtISO: string): string | null {
  const completedAt = new Date(completedAtISO);
  if (!Number.isFinite(completedAt.getTime())) return null;

  const value = item.frequency_value ?? 1;
  if (item.frequency_type === "daily") {
    const intervalDays = value > 0 ? 1 / value : 1;
    return new Date(completedAt.getTime() + intervalDays * 86400000).toISOString();
  }
  if (item.frequency_type === "weekly") {
    const intervalDays = value > 0 ? 7 / value : 7;
    return new Date(completedAt.getTime() + intervalDays * 86400000).toISOString();
  }
  if (item.frequency_type === "biweekly") {
    const intervalDays = value > 0 ? 14 / value : 14;
    return new Date(completedAt.getTime() + intervalDays * 86400000).toISOString();
  }
  if (item.frequency_type === "monthly") {
    const intervalDays = value > 0 ? 30 / value : 30;
    return new Date(completedAt.getTime() + intervalDays * 86400000).toISOString();
  }
  if (item.frequency_type === "custom") {
    const intervalDays = value > 0 ? value * 30 : 30;
    return new Date(completedAt.getTime() + intervalDays * 86400000).toISOString();
  }

  return null;
}
