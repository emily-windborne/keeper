import type { Item } from "@/data/inventory-mock";
import type { NewPlannedTaskInput, PlannedTask } from "@/lib/db/map-rows";
import type { RefineChange } from "@/lib/api/refine-types";
import { formatDayAndRange } from "@/lib/planner/clock-label";
import { DEFAULT_DAY_START_MIN, suggestSlot, type DeferredPlanNotice } from "@/lib/planner/plan-my-week";

export type SchedulePreviewRow = {
  key: string;
  title: string;
  detail: string;
  available: boolean;
  kind: "add" | "move" | "remove" | "defer";
  add?: NewPlannedTaskInput;
  move?: {
    planned_task_id: string;
    scheduled_date: string;
    scheduled_time_start: string;
    scheduled_time_end: string;
  };
  removeId?: string;
  defer?: { itemId: string; nextDueISO: string; previousDue: string | null };
};

function formatWhen(dateISO: string, start: string | null, end: string | null): string {
  if (!start) return formatDayAndRange(dateISO, null, null);
  return formatDayAndRange(dateISO, start, end ?? null);
}

function asTask(input: NewPlannedTaskInput, id: string): PlannedTask {
  return {
    id,
    item_id: input.item_id,
    title_snapshot: input.title_snapshot,
    scheduled_date: input.scheduled_date,
    scheduled_time_start: input.scheduled_time_start,
    scheduled_time_end: input.scheduled_time_end,
    status: "planned",
    priority_override: null,
    notes: null,
    created_at: "",
    updated_at: "",
  };
}

function candidateDays(toDate: string, weekISOs: string[], todayISO: string): string[] {
  if (/^\d{4}-\d{2}-\d{2}$/.test(toDate)) return [toDate];
  const future = weekISOs.filter((iso) => iso >= todayISO);
  return future.length > 0 ? future : weekISOs;
}

/** Turn "what to change" into calendar rows. Times come from the slot finder. */
export function proposalsFromRefine(
  changes: RefineChange[],
  items: Item[],
  tasks: PlannedTask[],
  weekISOs: string[],
  todayISO: string,
  now: Date,
  dayStartMin: number = DEFAULT_DAY_START_MIN,
  wakeMin?: number,
  windDownMin?: number,
): SchedulePreviewRow[] {
  const itemById = new Map(items.map((item) => [item.id, item]));
  let open = tasks.filter((task) => task.status !== "done" && task.status !== "skipped");
  const rows: SchedulePreviewRow[] = [];

  changes.forEach((change, index) => {
    if (change.action === "remove") {
      const task = tasks.find((row) => row.id === change.planned_task_id);
      if (!task) return;
      if (itemById.get(task.item_id)?.type === "anchor") return;
      open = open.filter((row) => row.id !== task.id);
      rows.push({
        key: `remove-${task.id}-${index}`,
        title: `Remove ${task.title_snapshot}`,
        detail: "Take it off the calendar.",
        available: true,
        kind: "remove",
        removeId: task.id,
      });
      return;
    }

    if (change.action === "move") {
      const task = tasks.find((row) => row.id === change.planned_task_id);
      const item = task ? itemById.get(task.item_id) : undefined;
      if (!task || !item) return;
      if (item.type === "anchor") return;
      open = open.filter((row) => row.id !== task.id);
      const slot = suggestSlot(
        item,
        candidateDays(change.to_date, weekISOs, todayISO),
        open,
        todayISO,
        now,
        dayStartMin,
        wakeMin,
        windDownMin,
      );
      if (!slot) {
        rows.push({
          key: `move-${task.id}-${index}`,
          title: `Move ${task.title_snapshot}`,
          detail: "No open time for that move.",
          available: false,
          kind: "move",
        });
        return;
      }
      const input: NewPlannedTaskInput = {
        item_id: item.id,
        title_snapshot: task.title_snapshot,
        scheduled_date: slot.scheduled_date,
        scheduled_time_start: slot.scheduled_time_start,
        scheduled_time_end: slot.scheduled_time_end,
        status: "moved",
        priority_override: task.priority_override,
        notes: task.notes,
      };
      open = [...open, asTask(input, task.id)];
      rows.push({
        key: `move-${task.id}-${index}`,
        title: `Move ${task.title_snapshot}`,
        detail: `${formatWhen(task.scheduled_date, task.scheduled_time_start, task.scheduled_time_end)} to ${formatWhen(slot.scheduled_date, slot.scheduled_time_start, slot.scheduled_time_end)}`,
        available: true,
        kind: "move",
        move: {
          planned_task_id: task.id,
          scheduled_date: slot.scheduled_date,
          scheduled_time_start: slot.scheduled_time_start,
          scheduled_time_end: slot.scheduled_time_end,
        },
      });
      return;
    }

    const item = itemById.get(change.item_id);
    if (!item) return;
    const slot = suggestSlot(
      item,
      candidateDays(change.to_date, weekISOs, todayISO),
      open,
      todayISO,
      now,
      dayStartMin,
      wakeMin,
      windDownMin,
    );
    if (!slot) {
      rows.push({
        key: `add-${item.id}-${index}`,
        title: `Add ${item.title}`,
        detail: "No open time this week.",
        available: false,
        kind: "add",
      });
      return;
    }
    const input: NewPlannedTaskInput = {
      item_id: item.id,
      title_snapshot: item.title,
      scheduled_date: slot.scheduled_date,
      scheduled_time_start: slot.scheduled_time_start,
      scheduled_time_end: slot.scheduled_time_end,
      status: "planned",
      priority_override: null,
      notes: null,
    };
    open = [...open, asTask(input, `new-${index}`)];
    rows.push({
      key: `add-${item.id}-${index}`,
      title: `Add ${item.title}`,
      detail: formatWhen(slot.scheduled_date, slot.scheduled_time_start, slot.scheduled_time_end),
      available: true,
      kind: "add",
      add: input,
    });
  });

  return rows;
}

export function proposalsFromPlan(
  inputs: NewPlannedTaskInput[],
  deferred: DeferredPlanNotice[],
  items: Item[],
): SchedulePreviewRow[] {
  const previousDue = new Map(items.map((item) => [item.id, item.next_due_date]));
  const adds: SchedulePreviewRow[] = inputs.map((input, index) => ({
    key: `plan-add-${input.item_id}-${input.scheduled_date}-${input.scheduled_time_start ?? "none"}-${index}`,
    title: `Add ${input.title_snapshot}`,
    detail: formatWhen(input.scheduled_date, input.scheduled_time_start, input.scheduled_time_end),
    available: Boolean(input.scheduled_date && input.scheduled_time_start && input.scheduled_time_end),
    kind: "add",
    add: input,
  }));
  const holds: SchedulePreviewRow[] = deferred.map((notice) => ({
    key: `plan-defer-${notice.itemId}`,
    title: notice.title,
    detail: notice.userMessage,
    available: true,
    kind: "defer",
    defer: {
      itemId: notice.itemId,
      nextDueISO: notice.nextDueISO,
      previousDue: previousDue.get(notice.itemId) ?? null,
    },
  }));
  return [...adds, ...holds];
}
