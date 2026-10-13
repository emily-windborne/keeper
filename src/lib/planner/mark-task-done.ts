import type { SupabaseClient } from "@supabase/supabase-js";
import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";
import { computeNextDueDate } from "@/lib/inventory/compute-next-due";

export type ItemCompletionPatch = {
  is_archived?: boolean;
  last_completed_at: string;
  next_due_date?: string | null;
  updated_at: string;
};

/**
 * What "mark done" writes, shared by Planner and Check-In.
 * One-off items are archived. Recurring items move their next due date.
 * Goals stay on the item until you edit them.
 */
export function completionPatchForItem(item: Item, nowISO: string): ItemCompletionPatch | null {
  if (item.type === "one_off") {
    return {
      is_archived: true,
      last_completed_at: nowISO,
      updated_at: nowISO,
    };
  }
  if (item.type === "recurring") {
    return {
      last_completed_at: nowISO,
      next_due_date: computeNextDueDate(item, nowISO),
      updated_at: nowISO,
    };
  }
  return null;
}

export type MarkDoneResult = {
  task: PlannedTask;
  item: Item | null;
  error: string | null;
};

export async function markPlannedTaskDone(
  supabase: SupabaseClient,
  task: PlannedTask,
  item: Item | null,
  nowISO: string = new Date().toISOString(),
): Promise<MarkDoneResult> {
  const { error: taskErr } = await supabase
    .from("planned_tasks")
    .update({ status: "done", updated_at: nowISO })
    .eq("id", task.id);

  if (taskErr) {
    return { task, item, error: taskErr.message };
  }

  const updatedTask: PlannedTask = { ...task, status: "done", updated_at: nowISO };
  if (!item) {
    return { task: updatedTask, item: null, error: null };
  }

  const patch = completionPatchForItem(item, nowISO);
  if (!patch) {
    return { task: updatedTask, item, error: null };
  }

  const { error: itemErr } = await supabase.from("items").update(patch).eq("id", item.id);
  if (itemErr) {
    return { task: updatedTask, item, error: itemErr.message };
  }

  return { task: updatedTask, item: { ...item, ...patch }, error: null };
}
