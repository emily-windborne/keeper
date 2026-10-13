import type { SupabaseClient } from "@supabase/supabase-js";
import { mapPlannedTaskRow, type PlannedTask, type NewPlannedTaskInput } from "@/lib/db/map-rows";
import type { DeferredPlanNotice } from "@/lib/planner/plan-my-week";

type DeferredPayload = {
  item_id: string;
  next_due_date: string;
};

/**
 * Save a whole week plan in one database call.
 * Deferred due dates and new tasks commit together, or not at all.
 */
export async function applyPlanMyWeek(
  supabase: SupabaseClient,
  inputs: NewPlannedTaskInput[],
  deferred: DeferredPlanNotice[],
): Promise<{ tasks: PlannedTask[]; error: string | null }> {
  const p_deferred: DeferredPayload[] = deferred.map((d) => ({
    item_id: d.itemId,
    next_due_date: d.nextDueISO,
  }));

  const { data, error } = await supabase.rpc("apply_plan_my_week", {
    p_tasks: inputs,
    p_deferred,
  });

  if (error) {
    const missing =
      /apply_plan_my_week/i.test(error.message) || /could not find the function/i.test(error.message);
    return {
      tasks: [],
      error: missing
        ? "Plan my week needs a database update. In Supabase, run supabase/migrations/002_apply_plan_my_week.sql, then try again."
        : error.message,
    };
  }

  const rows = Array.isArray(data) ? data : [];
  return {
    tasks: rows.map((row) => mapPlannedTaskRow(row as Parameters<typeof mapPlannedTaskRow>[0])),
    error: null,
  };
}
