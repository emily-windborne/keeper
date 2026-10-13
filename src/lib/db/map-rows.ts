import type { Item } from "@/data/inventory-mock";
import { withInitialNextDueDateIfNeeded } from "@/lib/inventory/compute-next-due";

export function clampTimesPerPeriod(value: number | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(14, Math.max(1, Math.round(n)));
}

export function itemColumns(
  item: Omit<Item, "id" | "created_at" | "updated_at">,
): Record<string, unknown> {
  return {
    title: item.title,
    category: item.category,
    type: item.type,
    frequency_type: item.frequency_type,
    frequency_value: item.frequency_value,
    times_per_period: clampTimesPerPeriod(item.times_per_period),
    preferred_days: item.preferred_days,
    preferred_time_of_day: item.preferred_time_of_day,
    estimated_minutes: item.estimated_minutes,
    priority: item.priority,
    flexibility: item.flexibility,
    cadence_pressure: item.cadence_pressure,
    minimum_success_threshold: item.minimum_success_threshold,
    notes: item.notes,
    is_archived: item.is_archived,
    last_completed_at: item.last_completed_at,
    next_due_date: item.next_due_date,
  };
}

export type PlannedTask = {
  id: string;
  item_id: string;
  title_snapshot: string;
  scheduled_date: string;
  scheduled_time_start: string | null;
  scheduled_time_end: string | null;
  status: "planned" | "done" | "skipped" | "moved";
  priority_override: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  user_id: string;
  title: string;
  category: Item["category"];
  type: Item["type"];
  frequency_type: Item["frequency_type"];
  frequency_value: number | null;
  times_per_period: number | null;
  preferred_days: string[] | null;
  preferred_time_of_day: Item["preferred_time_of_day"];
  estimated_minutes: number;
  priority: Item["priority"];
  flexibility: Item["flexibility"];
  cadence_pressure: Item["cadence_pressure"];
  minimum_success_threshold: string | null;
  notes: string | null;
  is_archived: boolean;
  last_completed_at: string | null;
  next_due_date: string | null;
  created_at: string;
  updated_at: string;
};

type PlannedTaskRow = {
  id: string;
  user_id: string;
  item_id: string;
  title_snapshot: string;
  scheduled_date: string;
  scheduled_time_start: string | null;
  scheduled_time_end: string | null;
  status: PlannedTask["status"];
  priority_override: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function mapItemRow(row: ItemRow): Item {
  const preferred = row.preferred_days;
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    type: row.type,
    frequency_type: row.frequency_type,
    frequency_value: row.frequency_value,
    times_per_period: clampTimesPerPeriod(row.times_per_period),
    preferred_days: Array.isArray(preferred) ? preferred : null,
    preferred_time_of_day: row.preferred_time_of_day,
    estimated_minutes: row.estimated_minutes,
    priority: row.priority,
    flexibility: row.flexibility,
    cadence_pressure: row.cadence_pressure,
    minimum_success_threshold: row.minimum_success_threshold,
    notes: row.notes,
    is_archived: row.is_archived,
    last_completed_at: row.last_completed_at,
    next_due_date: row.next_due_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapPlannedTaskRow(row: PlannedTaskRow): PlannedTask {
  return {
    id: row.id,
    item_id: row.item_id,
    title_snapshot: row.title_snapshot,
    scheduled_date: row.scheduled_date,
    scheduled_time_start: row.scheduled_time_start,
    scheduled_time_end: row.scheduled_time_end,
    status: row.status,
    priority_override: row.priority_override,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function itemToInsertRow(
  userId: string,
  item: Omit<Item, "id" | "created_at" | "updated_at">,
): Record<string, unknown> {
  const prepared = withInitialNextDueDateIfNeeded(item, new Date().toISOString());
  return {
    user_id: userId,
    ...itemColumns(prepared),
  };
}

export function itemToUpdateRow(item: Item, nowISO: string): Record<string, unknown> {
  return {
    ...itemColumns(item),
    updated_at: nowISO,
  };
}

export type NewPlannedTaskInput = Omit<PlannedTask, "id" | "created_at" | "updated_at">;

export function plannedTaskToInsertRow(
  userId: string,
  input: NewPlannedTaskInput,
): Record<string, unknown> {
  return {
    user_id: userId,
    item_id: input.item_id,
    title_snapshot: input.title_snapshot,
    scheduled_date: input.scheduled_date,
    scheduled_time_start: input.scheduled_time_start,
    scheduled_time_end: input.scheduled_time_end,
    status: input.status,
    priority_override: input.priority_override,
    notes: input.notes,
  };
}
