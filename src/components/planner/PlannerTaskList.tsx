"use client";

import { TaskIcon } from "@/components/planner/TaskIcon";
import { formatClockRange } from "@/lib/planner/clock-label";
import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";

export function PlannerTaskList({
  tasks,
  itemById,
  onOpenTask,
}: {
  tasks: PlannedTask[];
  itemById: Map<string, Item>;
  onOpenTask: (taskId: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <p className="rounded-[14px] border border-dashed border-border bg-surface-alt/60 px-4 py-10 text-center text-[13px] text-ink-muted">
        No planned tasks for this day yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {tasks.map((task) => {
        const item = itemById.get(task.item_id);
        if (!item) return null;
        const done = task.status === "done";
        const skipped = task.status === "skipped";
        const displayedDurationMinutes =
          task.scheduled_time_start && task.scheduled_time_end
            ? (() => {
                const [sh, sm] = task.scheduled_time_start.split(":").map(Number);
                const [eh, em] = task.scheduled_time_end.split(":").map(Number);
                const diff = eh * 60 + em - (sh * 60 + sm);
                return Number.isFinite(diff) && diff > 0 ? diff : item.estimated_minutes;
              })()
            : item.estimated_minutes;
        return (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onOpenTask(task.id)}
              className={`w-full rounded-[14px] border border-border bg-surface-raised p-3 text-left shadow-soft transition-opacity ${
                done ? "opacity-80" : ""
              } ${skipped ? "opacity-80" : ""}`}
              aria-label={`Task actions for ${task.title_snapshot}`}
            >
              <div className="flex items-start gap-2.5">
                <TaskIcon title={task.title_snapshot} category={item.category} override={item.icon} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[15px] font-semibold text-ink">{task.title_snapshot}</h3>
                    {task.status !== "planned" ? (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[12px] font-medium ${
                          task.status === "done"
                            ? "border-accent/20 bg-teal-light text-teal"
                            : task.status === "skipped"
                              ? "border-border bg-surface-alt text-ink-muted"
                              : "border-accent/20 bg-accent-soft/60 text-accent"
                        }`}
                      >
                        {task.status === "done" ? "Done" : task.status === "skipped" ? "Skipped" : "Moved"}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[13px] text-ink-muted">
                    {task.scheduled_time_start
                      ? formatClockRange(task.scheduled_time_start, task.scheduled_time_end)
                      : `${displayedDurationMinutes} min`}
                  </div>
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
