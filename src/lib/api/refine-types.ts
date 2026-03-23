import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";

/** POST /api/refine request (product spec). */
export type RefineApiAction =
  | "plan_week"
  | "lighten_day"
  | "one_hour"
  | "rebalance"
  | "custom";

export type RefineRequestBody = {
  action: RefineApiAction;
  /** Required when action is `custom`: the user’s free-text request. */
  custom_prompt?: string;
  context: {
    items: Item[];
    planned_tasks: PlannedTask[];
    week_start: string;
    target_date?: string;
    available_minutes?: number;
  };
};

export type RefineChange =
  | { action: "move"; planned_task_id: string; to_date: string }
  | { action: "add"; item_id: string; to_date: string; scheduled_time_start?: string }
  | { action: "remove"; planned_task_id: string };

/** POST /api/refine success body (product spec). */
export type RefineResponseBody = {
  changes: RefineChange[];
  note: string;
};
