import type { ItemCategory } from "@/data/inventory-mock";

/** How many titled pills a day cell shows before the rest become +N. */
export const MONTH_PILL_LIMIT = 3;

export type MonthPillTask = {
  id: string;
  title: string;
  start: string | null;
  category: ItemCategory;
};

export type MonthPill = {
  id: string;
  title: string;
  category: ItemCategory;
};

/** Earliest tasks first. The rest of a crowded day is a +N count. */
export function monthPillsForDay(tasks: MonthPillTask[]): { pills: MonthPill[]; extra: number } {
  const sorted = [...tasks].sort((a, b) => {
    const byTime = (a.start ?? "99:99").localeCompare(b.start ?? "99:99");
    if (byTime !== 0) return byTime;
    return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  });
  return {
    pills: sorted.slice(0, MONTH_PILL_LIMIT).map((task) => ({
      id: task.id,
      title: task.title,
      category: task.category,
    })),
    extra: Math.max(0, sorted.length - MONTH_PILL_LIMIT),
  };
}
