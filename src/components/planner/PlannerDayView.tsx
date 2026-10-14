"use client";

import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";
import { CategoryIcon } from "@/components/CategoryIcon";
import { consumeBackgroundClick, DragBlock } from "@/components/planner/DragBlock";
import { timeStartToHour, parseTimeToMinutesSinceMidnight } from "@/components/planner/planner-view-utils";
import { formatClock, formatClockRange } from "@/lib/planner/clock-label";
import { minutesFromPointerY, minutesToHHMM, TIMELINE_END_MIN, TIMELINE_START_MIN } from "@/lib/planner/time-snap";

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 23;
const HOUR_PX = 64;

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
  return formatClock(`${hour}:00`);
}

export function PlannerDayView({
  tasks,
  itemById,
  dateISO,
  onOpenTask,
  onCommitSchedule,
  onCreateAt,
}: {
  tasks: PlannedTask[];
  itemById: Map<string, Item>;
  dateISO: string;
  onOpenTask: (taskId: string) => void;
  onCommitSchedule: (
    taskId: string,
    patch: { scheduled_date: string; scheduled_time_start: string; scheduled_time_end: string },
  ) => void;
  onCreateAt: (dateISO: string, timeHHMM: string) => void;
}) {
  const anchors = tasks.filter((task) => itemById.get(task.item_id)?.type === "anchor");
  const blocks = tasks.filter((task) => itemById.get(task.item_id)?.type !== "anchor");
  const noTime: PlannedTask[] = [];
  const outsideWindow: PlannedTask[] = [];

  for (const task of blocks) {
    const hour = timeStartToHour(task.scheduled_time_start);
    if (hour == null) {
      noTime.push(task);
    } else if (hour < DAY_START_HOUR || hour > DAY_END_HOUR) {
      outsideWindow.push(task);
    }
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
                <span>{formatClockRange(task.scheduled_time_start, task.scheduled_time_end)}</span>
              )}
              <span>{dur} min</span>
            </div>
          </div>
        </div>
      </button>
    );
  }

  const timelineHeight = ((TIMELINE_END_MIN - TIMELINE_START_MIN) / 60) * HOUR_PX;
  const timedBlocks = blocks.flatMap((task) => {
    const item = itemById.get(task.item_id);
    const start = task.scheduled_time_start
      ? parseTimeToMinutesSinceMidnight(task.scheduled_time_start)
      : null;
    if (!item || start == null || start < TIMELINE_START_MIN || start >= TIMELINE_END_MIN) return [];
    const endRaw = task.scheduled_time_end
      ? parseTimeToMinutesSinceMidnight(task.scheduled_time_end)
      : null;
    const end = endRaw != null && endRaw > start ? endRaw : start + Math.max(15, item.estimated_minutes);
    return [{ task, item, startMin: start, endMin: Math.min(TIMELINE_END_MIN, end) }];
  });

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
                      <span className="text-[12px] text-ink-muted">
                        {formatClock(task.scheduled_time_start)}
                      </span>
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

      {blocks.length === 0 && anchors.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-border bg-surface-alt/60 px-4 py-6 text-center text-[13px] text-ink-muted">
          Nothing here yet. Tap an open time to add something.
        </p>
      ) : null}

      <div className="grid grid-cols-[3.5rem_1fr] gap-2 sm:grid-cols-[4.5rem_1fr]">
        <div className="relative" style={{ height: timelineHeight }}>
          {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i).map(
            (hour) => (
              <div
                key={hour}
                className="absolute right-0 text-right text-[11px] font-medium tabular-nums text-ink-muted sm:text-[12px]"
                style={{ top: (hour - DAY_START_HOUR) * HOUR_PX }}
              >
                {formatHourLabel(hour)}
              </div>
            ),
          )}
        </div>
        <div
          data-day-column={dateISO}
          className="relative rounded-[14px] border border-border/70 bg-surface-raised"
          style={{ height: timelineHeight }}
          onClick={(event) => {
            if (consumeBackgroundClick()) return;
            if ((event.target as HTMLElement).closest("[data-task]")) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const minutes = minutesFromPointerY(
              event.clientY - rect.top,
              rect.height,
              TIMELINE_START_MIN,
              TIMELINE_END_MIN,
            );
            onCreateAt(dateISO, minutesToHHMM(minutes));
          }}
        >
          {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => (
            <div
              key={i}
              className="pointer-events-none absolute left-0 right-0 border-t border-border/50"
              style={{ top: i * HOUR_PX }}
            />
          ))}
          {timedBlocks.map(({ task, item, startMin, endMin }) => {
            const top = ((startMin - TIMELINE_START_MIN) / 60) * HOUR_PX;
            const height = Math.max(44, ((endMin - startMin) / 60) * HOUR_PX);
            const editable = task.status !== "done" && task.status !== "skipped";
            return (
              <DragBlock
                key={task.id}
                enabled={editable}
                canResize={editable}
                startMin={startMin}
                endMin={endMin}
                hourPx={HOUR_PX}
                dateISO={dateISO}
                ariaLabel={`${task.title_snapshot}, ${formatClockRange(task.scheduled_time_start, task.scheduled_time_end)}. Drag to move, or drag the gold bar to change the length.`}
                className="absolute left-1 right-1 z-[5] overflow-hidden rounded-[12px] border border-border bg-[#f6f4f0] px-2 py-1 text-left shadow-soft"
                style={{ top, height }}
                onOpen={() => onOpenTask(task.id)}
                onCommit={(next) =>
                  onCommitSchedule(task.id, {
                    scheduled_date: next.dateISO,
                    scheduled_time_start: minutesToHHMM(next.startMin),
                    scheduled_time_end: minutesToHHMM(next.endMin),
                  })
                }
              >
                <span className="block truncate text-[13px] font-semibold text-ink">{task.title_snapshot}</span>
                <span className="block text-[11px] text-ink-muted">
                  {formatClockRange(minutesToHHMM(startMin), minutesToHHMM(endMin))}
                </span>
                <span className="sr-only">{item.title}</span>
              </DragBlock>
            );
          })}
        </div>
      </div>
    </div>
  );
}
