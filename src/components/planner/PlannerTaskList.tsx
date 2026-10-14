"use client";

import { CategoryIcon } from "@/components/CategoryIcon";
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
              className={`w-full rounded-[14px] border border-border bg-surface-raised p-4 text-left shadow-soft transition-opacity ${
                done ? "opacity-80" : ""
              } ${skipped ? "opacity-80" : ""}`}
              aria-label={`Task actions for ${task.title_snapshot}`}
            >
              <div className="flex items-start gap-3">
                <CategoryIcon category={item.category} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[15px] font-semibold text-ink">{task.title_snapshot}</h3>
                    <span
                      className={`rounded-full border px-3 py-1 text-[12px] font-medium ${
                        task.status === "done"
                          ? "border-accent/20 bg-teal-light text-teal"
                          : task.status === "skipped"
                            ? "border-border bg-surface-alt text-ink-muted"
                            : task.status === "moved"
                              ? "border-accent/20 bg-accent-soft/60 text-accent"
                              : "border-border bg-surface-alt text-ink-muted"
                      }`}
                    >
                      {task.status === "planned"
                        ? "Planned"
                        : task.status === "done"
                          ? "Done"
                          : task.status === "skipped"
                            ? "Skipped"
                            : "Moved"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted">
                    {task.scheduled_time_start && (
                      <span>{formatClockRange(task.scheduled_time_start, task.scheduled_time_end)}</span>
                    )}
                    <span>{displayedDurationMinutes} min</span>
                    <span className="hidden sm:inline">{item.category}</span>
                  </div>
                </div>
              </div>
              {done && (
                <div className="mt-3 flex items-center text-teal" aria-hidden>
                  <span className="text-[13px] font-medium">✓</span>
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
