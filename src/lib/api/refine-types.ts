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
    now?: {
      date: string;
      time: string;
      time_zone: string;
    };
  };
};

/** What should change. The app picks the clock time. */
export type RefineChange =
  | { action: "move"; planned_task_id: string; to_date: string }
  | { action: "add"; item_id: string; to_date: string }
  | { action: "remove"; planned_task_id: string };

export const REFINE_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["changes", "note"],
  properties: {
    note: { type: "string" },
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "item_id", "planned_task_id", "to_date"],
        properties: {
          action: { type: "string", enum: ["add", "move", "remove"] },
          item_id: { type: "string" },
          planned_task_id: { type: "string" },
          to_date: { type: "string" },
        },
      },
    },
  },
} as const;

/** POST /api/refine success body (product spec). */
export type RefineResponseBody = {
  changes: RefineChange[];
  note: string;
};
