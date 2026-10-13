import type { SupabaseClient } from "@supabase/supabase-js";
import type { Item } from "@/data/inventory-mock";
import { mapPlannedTaskRow, type PlannedTask } from "@/lib/db/map-rows";

export type FutureTaskPatch = {
  id: string;
  title_snapshot: string;
  scheduled_time_end: string | null;
};

function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseStart(value: string | null): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** Upcoming tasks follow the item title and length. Done, skipped, and past tasks stay as they were. */
export function patchesForFutureTasks(item: Item, tasks: PlannedTask[], todayISO: string): FutureTaskPatch[] {
  const patches: FutureTaskPatch[] = [];
  for (const task of tasks) {
    if (task.item_id !== item.id) continue;
    if (task.scheduled_date < todayISO) continue;
    if (task.status === "done" || task.status === "skipped") continue;
    const start = parseStart(task.scheduled_time_start);
    let end = task.scheduled_time_end;
    if (start != null) {
      const next = Math.min(23 * 60, start + Math.max(1, item.estimated_minutes));
      end = next > start ? minutesToTime(next) : end;
    }
    if (task.title_snapshot === item.title && end === task.scheduled_time_end) continue;
    patches.push({ id: task.id, title_snapshot: item.title, scheduled_time_end: end });
  }
  return patches;
}

export async function syncFutureTasks(
  supabase: SupabaseClient,
  item: Item,
  todayISO: string,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from("planned_tasks").select("*").eq("item_id", item.id);
  if (error) return { error: error.message };
  const tasks = (data ?? []).map((row) => mapPlannedTaskRow(row as Parameters<typeof mapPlannedTaskRow>[0]));
  const patches = patchesForFutureTasks(item, tasks, todayISO);
  const nowISO = new Date().toISOString();
  for (const patch of patches) {
    const { error: updateError } = await supabase
      .from("planned_tasks")
      .update({
        title_snapshot: patch.title_snapshot,
        scheduled_time_end: patch.scheduled_time_end,
        updated_at: nowISO,
      })
      .eq("id", patch.id);
    if (updateError) return { error: updateError.message };
  }
  return { error: null };
}
