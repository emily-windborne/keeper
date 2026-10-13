"use client";

import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";
import { CategoryIcon } from "@/components/CategoryIcon";
import { timeStartToHour } from "@/components/planner/planner-view-utils";

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 22;

function displayedDurationMinutes(task: PlannedTask, item: Item): number {
  if (task.scheduled_time_start && task.scheduled_time_end) {
    const [sh, sm] = task.scheduled_time_start.split(":").map(Number);
    const [eh, em] = task.scheduled_time_end.split(":").map(Number);
    const diff = eh * 60 + em - (sh * 60 + sm);
    return Number.isFinite(diff) && diff > 0 ? diff : item.estimated_minutes;
  }
  return item.estimated_minutes;
}

function formatHourLabel(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function PlannerDayView({
  tasks,
  itemById,
  onOpenTask,
}: {
  tasks: PlannedTask[];
  itemById: Map<string, Item>;
  onOpenTask: (taskId: string) => void;
}) {
  const anchors = tasks.filter((task) => itemById.get(task.item_id)?.type === "anchor");
  const blocks = tasks.filter((task) => itemById.get(task.item_id)?.type !== "anchor");
  const noTime: PlannedTask[] = [];
  const outsideWindow: PlannedTask[] = [];
  const byHour = new Map<number, PlannedTask[]>();
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) {
    byHour.set(h, []);
  }

  for (const task of blocks) {
    const hour = timeStartToHour(task.scheduled_time_start);
    if (hour == null) {
      noTime.push(task);
    } else if (hour < DAY_START_HOUR || hour > DAY_END_HOUR) {
      outsideWindow.push(task);
    } else {
      byHour.get(hour)!.push(task);
    }
  }

  for (const list of byHour.values()) {
    list.sort((a, b) => (a.scheduled_time_start ?? "").localeCompare(b.scheduled_time_start ?? ""));
  }
  noTime.sort((a, b) => a.title_snapshot.localeCompare(b.title_snapshot));
  outsideWindow.sort((a, b) => (a.scheduled_time_start ?? "").localeCompare(b.scheduled_time_start ?? ""));

  function renderTaskCard(task: PlannedTask) {
    const item = itemById.get(task.item_id);
    if (!item) return null;
    const done = task.status === "done";
    const skipped = task.status === "skipped";
    const dur = displayedDurationMinutes(task, item);
    return (
      <button
        key={task.id}
        type="button"
        onClick={() => onOpenTask(task.id)}
        className={`w-full rounded-[14px] border border-border bg-surface-raised p-3 text-left shadow-soft transition-opacity sm:p-4 ${
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
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium sm:px-3 sm:py-1 sm:text-[12px] ${
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
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted sm:text-[13px]">
              {task.scheduled_time_start && (
                <span>
                  {task.scheduled_time_start}
                  {task.scheduled_time_end ? ` – ${task.scheduled_time_end}` : ""}
                </span>
              )}
              <span>{dur} min</span>
            </div>
          </div>
        </div>
      </button>
    );
  }

  if (blocks.length === 0 && anchors.length === 0) {
    return (
      <p className="rounded-[14px] border border-dashed border-border bg-surface-alt/60 px-4 py-10 text-center text-[13px] text-ink-muted">
        No planned tasks for this day yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {anchors.length > 0 && (
        <section aria-label="Routines">
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            Routines
          </h3>
          <ul className="flex flex-col gap-2">
            {anchors.map((task) => {
              const item = itemById.get(task.item_id);
              if (!item) return null;
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-full border border-border bg-surface-alt/70 px-3 text-left"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{task.title_snapshot}</span>
                    {task.scheduled_time_start && (
                      <span className="text-[12px] text-ink-muted">{task.scheduled_time_start}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {noTime.filter((t) => itemById.has(t.item_id)).length > 0 && (
        <section aria-label="Tasks without a start time">
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            No time set
          </h3>
          <ul className="flex flex-col gap-2">
            {noTime.filter((t) => itemById.has(t.item_id)).map((t) => renderTaskCard(t))}
          </ul>
        </section>
      )}

      {outsideWindow.filter((t) => itemById.has(t.item_id)).length > 0 && (
        <section aria-label="Tasks outside daytime window">
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            Other times
          </h3>
          <ul className="flex flex-col gap-2">
            {outsideWindow.filter((t) => itemById.has(t.item_id)).map((t) => renderTaskCard(t))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-0">
        {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i).map(
          (hour) => {
            const slotTasks = byHour.get(hour) ?? [];
            return (
              <div
                key={hour}
                className="grid grid-cols-[3.5rem_1fr] gap-2 border-b border-border/60 py-3 last:border-b-0 sm:grid-cols-[4.5rem_1fr] sm:gap-4"
              >
                <div className="pt-1 text-right text-[11px] font-medium tabular-nums text-ink-muted sm:text-[12px]">
                  {formatHourLabel(hour)}
                </div>
                <div className="min-w-0">
                  {slotTasks.length === 0 ? (
                    <p className="py-1 text-[12px] text-ink-faint sm:text-[13px]">—</p>
                  ) : (
                    <ul className="flex flex-col gap-2">{slotTasks.map((t) => renderTaskCard(t))}</ul>
                  )}
                </div>
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}
