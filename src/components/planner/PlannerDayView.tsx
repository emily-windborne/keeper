"use client";

import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";
import { TaskIcon } from "@/components/planner/TaskIcon";
import { consumeBackgroundClick, DragBlock } from "@/components/planner/DragBlock";
import { ProtectedBands } from "@/components/planner/ProtectedBands";
import type { ProtectedWindow } from "@/lib/planner/protected-time";
import { timeStartToHour, parseTimeToMinutesSinceMidnight } from "@/components/planner/planner-view-utils";
import { formatClock, formatClockRange } from "@/lib/planner/clock-label";
import { isRoutineMarkerId, routineMinutes } from "@/lib/planner/routine-markers";
import { minutesFromPointerY, minutesToHHMM, TIMELINE_END_MIN, TIMELINE_START_MIN } from "@/lib/planner/time-snap";

const DAY_START_HOUR = TIMELINE_START_MIN / 60;
const DAY_END_HOUR = 23;
const HOUR_PX = 64;

type DayTimed = {
  task: PlannedTask;
  item: Item;
  startMin: number;
  endMin: number;
};

/** Keep each block inside its own time, and sit true overlaps side by side. */
function layoutDayBlocks(blocks: DayTimed[]) {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const laneEnds: number[] = [];
  const withLane = sorted.map((block) => {
    let lane = laneEnds.findIndex((end) => end <= block.startMin);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(block.endMin);
    } else {
      laneEnds[lane] = block.endMin;
    }
    return { ...block, lane };
  });
  const laneCount = Math.max(1, laneEnds.length);
  return withLane.map((block) => {
    const next = withLane
      .filter((other) => other.lane === block.lane && other.startMin >= block.endMin)
      .sort((a, b) => a.startMin - b.startMin)[0];
    const durationPx = ((block.endMin - block.startMin) / 60) * HOUR_PX;
    const roomPx = next ? ((next.startMin - block.startMin) / 60) * HOUR_PX - 3 : durationPx;
    const heightPx = Math.max(20, Math.min(durationPx, Math.max(20, roomPx)));
    const top = ((block.startMin - TIMELINE_START_MIN) / 60) * HOUR_PX;
    return { ...block, laneCount, heightPx, top };
  });
}

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
  protectedWindows = [],
  onOpenTask,
  onCommitSchedule,
  onCreateAt,
}: {
  tasks: PlannedTask[];
  itemById: Map<string, Item>;
  dateISO: string;
  protectedWindows?: ProtectedWindow[];
  onOpenTask: (taskId: string) => void;
  onCommitSchedule: (
    taskId: string,
    patch: { scheduled_date: string; scheduled_time_start: string; scheduled_time_end: string },
  ) => void;
  onCreateAt: (dateISO: string, timeHHMM: string) => void;
}) {
  const noTime: PlannedTask[] = [];
  const outsideWindow: PlannedTask[] = [];
  const onTimeline: PlannedTask[] = [];

  for (const task of tasks) {
    if (!itemById.has(task.item_id)) continue;
    const hour = timeStartToHour(task.scheduled_time_start);
    if (hour == null) {
      noTime.push(task);
    } else if (hour < DAY_START_HOUR || hour > DAY_END_HOUR) {
      outsideWindow.push(task);
    } else {
      onTimeline.push(task);
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
        className={`w-full rounded-[14px] border border-border bg-surface-raised p-2.5 text-left shadow-soft transition-opacity ${
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
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
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
            <div className="mt-0.5 text-[12px] text-ink-muted">
              {task.scheduled_time_start
                ? formatClockRange(task.scheduled_time_start, task.scheduled_time_end)
                : `${dur} min`}
            </div>
          </div>
        </div>
      </button>
    );
  }

  const timelineHeight = ((TIMELINE_END_MIN - TIMELINE_START_MIN) / 60) * HOUR_PX;
  const timedBlocks = onTimeline.flatMap((task) => {
    const item = itemById.get(task.item_id);
    const start = task.scheduled_time_start
      ? parseTimeToMinutesSinceMidnight(task.scheduled_time_start)
      : null;
    if (!item || start == null || start < TIMELINE_START_MIN || start >= TIMELINE_END_MIN) return [];
    const endRaw = task.scheduled_time_end
      ? parseTimeToMinutesSinceMidnight(task.scheduled_time_end)
      : null;
    const setRoutine = routineMinutes(item);
    const end =
      setRoutine != null
        ? start + setRoutine
        : endRaw != null && endRaw > start
          ? endRaw
          : start + Math.max(15, item.estimated_minutes || 15);
    return [{ task, item, startMin: start, endMin: Math.min(TIMELINE_END_MIN, end) }];
  });

  return (
    <div className="flex flex-col gap-4">
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

      {onTimeline.length === 0 && noTime.length === 0 && outsideWindow.length === 0 ? (
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
          <ProtectedBands
            windows={protectedWindows}
            dateISO={dateISO}
            timelineStartMin={TIMELINE_START_MIN}
            timelineEndMin={TIMELINE_END_MIN}
            hourPx={HOUR_PX}
          />
          {layoutDayBlocks(timedBlocks).map(({ task, item, startMin, endMin, lane, laneCount, heightPx, top }) => {
            const routine = item.type === "anchor";
            const editable = task.status !== "done" && task.status !== "skipped" && !isRoutineMarkerId(task.id);
            const when = formatClockRange(minutesToHHMM(startMin), minutesToHHMM(endMin));
            const width = `calc((100% - 8px) / ${laneCount})`;
            const left = `calc(4px + ${lane} * (100% - 8px) / ${laneCount})`;
            return (
              <DragBlock
                key={task.id}
                enabled={editable}
                canResize={!routine && editable && heightPx >= 56}
                startMin={startMin}
                endMin={endMin}
                hourPx={HOUR_PX}
                dateISO={dateISO}
                ariaLabel={`${routine ? "Routine, " : ""}${task.title_snapshot}, ${when}. Tap to open.`}
                className={`absolute z-[5] overflow-hidden rounded-[12px] px-2 py-1 text-left ${
                  routine
                    ? "border border-dashed border-[#e5dad0] bg-[#f6f4f0]"
                    : "border border-border bg-[#f6f4f0] shadow-soft"
                }`}
                style={{ top, height: heightPx, width, left }}
                onOpen={() => onOpenTask(task.id)}
                onCommit={(next) =>
                  onCommitSchedule(task.id, {
                    scheduled_date: next.dateISO,
                    scheduled_time_start: minutesToHHMM(next.startMin),
                    scheduled_time_end: minutesToHHMM(next.endMin),
                  })
                }
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <TaskIcon
                    title={task.title_snapshot}
                    category={item.category}
                    override={item.icon}
                    size={18}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate text-[13px] ${
                      routine ? "font-medium text-ink-muted" : "font-semibold text-ink"
                    }`}
                  >
                    {task.title_snapshot}
                  </span>
                </span>
                {heightPx >= 40 ? (
                  <span className="mt-0.5 block truncate text-[11px] text-ink-muted">{when}</span>
                ) : null}
              </DragBlock>
            );
          })}
        </div>
      </div>
    </div>
  );
}
