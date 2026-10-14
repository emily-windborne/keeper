"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";
import { consumeBackgroundClick, DragBlock } from "@/components/planner/DragBlock";
import { ProtectedBands } from "@/components/planner/ProtectedBands";
import type { ProtectedWindow } from "@/lib/planner/protected-time";
import { parseTimeToMinutesSinceMidnight, toISODate } from "@/components/planner/planner-view-utils";
import { formatClockRange } from "@/lib/planner/clock-label";
import { isRoutineMarkerId, routineMinutes } from "@/lib/planner/routine-markers";
import { minutesFromPointerY, minutesToHHMM } from "@/lib/planner/time-snap";

const VIEW_BG = "#F7F2EC";
const SPINE = "#E5DAD0";
const GOLD = "#caa510";
const TEXT_MUTED = "rgba(15, 57, 76, 0.6)";
const TEXT_TIME = "rgba(15, 57, 76, 0.4)";
const TICK = "rgba(229, 218, 208, 0.55)";
const CREAM = "#f6f4f0";
const NAVY = "#0f394c";
const MUSTARD = "#caa510";
const MUSTARD_SOFT = "#f5ecc4";

const TIMELINE_FIRST_HOUR = 6;
const TIMELINE_LAST_HOUR = 23;
const HOUR_COUNT = TIMELINE_LAST_HOUR - TIMELINE_FIRST_HOUR + 1;
/** One hour of vertical space — 60 minutes of duration maps to this height. */
const HOUR_PX = 36;
const TIMELINE_HEIGHT = HOUR_COUNT * HOUR_PX;
const UNSCHED_MIN_PX = 44;
const UNSCHED_PER_CHIP_PX = 28;
const UNSCHED_BAND_MAX_PX = 96;
const timelineStartMin = TIMELINE_FIRST_HOUR * 60;
const timelineEndMin = 24 * 60;
const totalTimelineMin = timelineEndMin - timelineStartMin;

function formatHourCompact(hour: number): string {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** `nowMs` stays null until mount so past-task opacity matches client clock (avoids hydration skew). */
function usePlannerNow(): { nowMin: number; nowMs: number | null } {
  const [state, setState] = useState(() => ({
    nowMin: minutesSinceMidnight(new Date()),
    nowMs: null as number | null,
  }));
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setState({ nowMin: minutesSinceMidnight(d), nowMs: d.getTime() });
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return state;
}

type TimedEntry = {
  task: PlannedTask;
  item: Item;
  /** Clamped to visible timeline — layout position / height. */
  startMin: number;
  endMin: number;
  /** Unclamped from `scheduled_time_start` + `estimated_minutes` — overlap detection. */
  rangeStart: number;
  rangeEnd: number;
};

type ShownEntry = TimedEntry & { extra: number; clusterEnd: number };

/**
 * Phone columns are too narrow for two titles. Show one readable block,
 * and a +N chip for anything that overlaps it.
 */
function collapseOverlaps(entries: TimedEntry[]): ShownEntry[] {
  const sorted = [...entries].sort(
    (a, b) => a.rangeStart - b.rangeStart || a.task.title_snapshot.localeCompare(b.task.title_snapshot),
  );
  const shown: ShownEntry[] = [];
  for (const entry of sorted) {
    const host = shown.find((row) => row.rangeStart < entry.rangeEnd && entry.rangeStart < row.clusterEnd);
    if (host) {
      host.extra += 1;
      host.clusterEnd = Math.max(host.clusterEnd, entry.rangeEnd);
      continue;
    }
    shown.push({ ...entry, extra: 0, clusterEnd: entry.rangeEnd });
  }
  return shown;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function isCompletedLook(task: PlannedTask): boolean {
  return task.status === "done" || task.status === "skipped";
}

function whenLabel(task: PlannedTask): string {
  return formatClockRange(task.scheduled_time_start, task.scheduled_time_end);
}

/** Today's column only: scheduled block has fully ended (start + estimated). */
function isTimedTaskPastToday(
  columnISO: string,
  todayISO: string,
  task: PlannedTask,
  item: Item,
  nowMs: number | null,
): boolean {
  if (nowMs == null || columnISO !== todayISO || !task.scheduled_time_start) return false;
  const startM = parseTimeToMinutesSinceMidnight(task.scheduled_time_start);
  if (startM == null) return false;
  const [y, mo, d] = columnISO.split("-").map(Number);
  const sh = Math.floor(startM / 60);
  const sm = startM % 60;
  const startDate = new Date(y, mo - 1, d, sh, sm, 0, 0);
  const endDate = new Date(startDate.getTime() + Math.max(1, item.estimated_minutes) * 60_000);
  return nowMs >= endDate.getTime();
}

export function PlannerWeekTimelineView({
  weekDays,
  plannedTasks,
  itemById,
  selectedDateISO,
  todayISO,
  onSelectDate,
  onOpenTask,
  onCommitSchedule,
  onCreateAt,
  onOpenDay,
  protectedWindows = [],
}: {
  weekDays: Date[];
  plannedTasks: PlannedTask[];
  itemById: Map<string, Item>;
  selectedDateISO: string;
  todayISO: string;
  onSelectDate: (iso: string) => void;
  onOpenTask: (taskId: string) => void;
  onCommitSchedule: (
    taskId: string,
    patch: { scheduled_date: string; scheduled_time_start: string; scheduled_time_end: string },
  ) => void;
  onCreateAt: (dateISO: string, timeHHMM: string) => void;
  onOpenDay: (dateISO: string) => void;
  protectedWindows?: ProtectedWindow[];
}) {
  const weekISOs = useMemo(() => weekDays.map((d) => toISODate(d)), [weekDays]);
  const { nowMin, nowMs } = usePlannerNow();

  const tasksByDate = useMemo(() => {
    const m = new Map<string, PlannedTask[]>();
    for (const iso of weekISOs) m.set(iso, []);
    for (const t of plannedTasks) {
      if (!weekISOs.includes(t.scheduled_date)) continue;
      m.get(t.scheduled_date)!.push(t);
    }
    for (const list of m.values()) {
      list.sort((a, b) => {
        const ta = a.scheduled_time_start ?? "99:99";
        const tb = b.scheduled_time_start ?? "99:99";
        return ta.localeCompare(tb) || a.title_snapshot.localeCompare(b.title_snapshot);
      });
    }
    return m;
  }, [plannedTasks, weekISOs]);

  const hourTicks = useMemo(
    () => Array.from({ length: HOUR_COUNT }, (_, i) => TIMELINE_FIRST_HOUR + i),
    [],
  );

  const hasAnyTask = useMemo(
    () => weekISOs.some((iso) => (tasksByDate.get(iso)?.length ?? 0) > 0),
    [tasksByDate, weekISOs],
  );

  const unschedBandHeight = useMemo(() => {
    let maxN = 0;
    for (const iso of weekISOs) {
      const dayTasks = tasksByDate.get(iso) ?? [];
      let n = 0;
      for (const t of dayTasks) {
        if (!itemById.has(t.item_id)) continue;
        const parsed = t.scheduled_time_start
          ? parseTimeToMinutesSinceMidnight(t.scheduled_time_start)
          : null;
        if (parsed == null) n += 1;
      }
      maxN = Math.max(maxN, n);
    }
    return Math.max(
      UNSCHED_MIN_PX,
      Math.min(UNSCHED_BAND_MAX_PX, 6 + maxN * UNSCHED_PER_CHIP_PX),
    );
  }, [tasksByDate, weekISOs, itemById]);

  const timeGutterW = "1.75rem";

  return (
    <div className="w-full overflow-x-auto" style={{ backgroundColor: VIEW_BG }}>
      {!hasAnyTask ? (
        <p className="px-4 py-3 text-center text-[13px] leading-relaxed" style={{ color: TEXT_MUTED }}>
          Nothing planned yet. Tap an open time to add something.
        </p>
      ) : null}
      <div className="w-max min-w-full">
      {/* Header row */}
      <div className="sticky top-0 z-20 flex" style={{ backgroundColor: VIEW_BG }}>
        <div
          className="sticky left-0 z-30 shrink-0"
          style={{ width: timeGutterW, backgroundColor: VIEW_BG }}
          aria-hidden
        />
        {weekDays.map((d) => {
          const iso = toISODate(d);
          const isToday = iso === todayISO;
          const letter = d.toLocaleDateString(undefined, { weekday: "narrow" });
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDate(iso)}
              className="min-h-11 min-w-[6.75rem] flex-1 py-1 text-center text-[13px] font-semibold tabular-nums"
              style={{ color: isToday ? GOLD : TEXT_MUTED }}
              aria-pressed={iso === selectedDateISO}
              aria-current={isToday ? "date" : undefined}
            >
              {letter} {d.getDate()}
            </button>
          );
        })}
      </div>

      {/* Time gutter + 7 spine columns */}
      <div className="flex">
        {/* Time labels + hour tick marks only in this column */}
        <div
          className="sticky left-0 z-30 shrink-0"
          style={{
            width: timeGutterW,
            height: unschedBandHeight + TIMELINE_HEIGHT,
            backgroundColor: VIEW_BG,
          }}
        >
          <div
            className="border-b border-dashed"
            style={{
              height: unschedBandHeight,
              borderColor: SPINE,
            }}
            aria-hidden
          />
          <div className="relative" style={{ height: TIMELINE_HEIGHT }}>
            {hourTicks.map((hour, i) => (
              <div
                key={hour}
                className="absolute left-0 right-0 flex items-start justify-end pr-0.5"
                style={{ top: i * HOUR_PX, height: HOUR_PX }}
              >
                <span
                  className="pt-0.5 text-[9px] font-medium tabular-nums leading-none"
                  style={{ color: TEXT_TIME }}
                >
                  {formatHourCompact(hour)}
                </span>
                {/* Faint tick into the day area (visual only; column is narrow) */}
                <span
                  className="pointer-events-none absolute right-0 top-1.5 block h-px w-2"
                  style={{ backgroundColor: TICK }}
                  aria-hidden
                />
              </div>
            ))}
          </div>
        </div>

        {weekISOs.map((iso) => {
          const dayTasks = tasksByDate.get(iso) ?? [];
          const timed: TimedEntry[] = [];
          const unscheduled: { task: PlannedTask; item: Item }[] = [];
          const isTodayCol = iso === todayISO;

          for (const task of dayTasks) {
            const item = itemById.get(task.item_id);
            if (!item) continue;
            const startRaw = task.scheduled_time_start
              ? parseTimeToMinutesSinceMidnight(task.scheduled_time_start)
              : null;
            if (startRaw == null) {
              unscheduled.push({ task, item });
              continue;
            }
            const endRaw = task.scheduled_time_end
              ? parseTimeToMinutesSinceMidnight(task.scheduled_time_end)
              : null;
            const setRoutine = routineMinutes(item);
            const durMin =
              setRoutine ??
              (endRaw != null && endRaw > startRaw
                ? endRaw - startRaw
                : Math.max(15, item.estimated_minutes || 15));
            const rangeEnd = startRaw + durMin;
            const startMin = clamp(startRaw, timelineStartMin, timelineEndMin - 1);
            const endForLane = clamp(rangeEnd, startMin + 1, timelineEndMin);
            const entry: TimedEntry = {
              task,
              item,
              startMin,
              endMin: endForLane,
              rangeStart: startRaw,
              rangeEnd,
            };
            timed.push(entry);
          }

          const shown = collapseOverlaps(timed);
          const unschedVisible = unscheduled.slice(0, 2);
          const unschedExtra = unscheduled.length - unschedVisible.length;
          const timelineTop = unschedBandHeight;
          const timelineBottom = timelineTop + TIMELINE_HEIGHT;

          return (
            <div
              key={iso}
              data-day-column={iso}
              className="relative min-w-[6.75rem] flex-1"
              style={{
                height: unschedBandHeight + TIMELINE_HEIGHT,
                backgroundColor: VIEW_BG,
                opacity: iso < todayISO ? 0.45 : 1,
              }}
              onClick={(event) => {
                if (consumeBackgroundClick()) return;
                if ((event.target as HTMLElement).closest("[data-task]")) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const y = event.clientY - rect.top - timelineTop;
                if (y < 0) return;
                onCreateAt(
                  iso,
                  minutesToHHMM(minutesFromPointerY(y, TIMELINE_HEIGHT, timelineStartMin, timelineEndMin)),
                );
              }}
            >
              {/* Unscheduled band */}
              <div
                className="absolute left-0 right-0 z-10 flex flex-wrap items-center justify-center gap-1 border-b border-dashed px-0.5 pt-1"
                style={{
                  top: 0,
                  height: unschedBandHeight,
                  borderColor: SPINE,
                }}
              >
                {unschedVisible.map(({ task }) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    title={task.title_snapshot}
                    className="flex min-h-11 w-full items-center overflow-hidden rounded-[4px] px-1 text-left text-[12px] font-semibold"
                    style={{ backgroundColor: MUSTARD_SOFT, color: NAVY }}
                    aria-label={`Task actions for ${task.title_snapshot}, no time set`}
                  >
                    <span className="truncate">{task.title_snapshot}</span>
                  </button>
                ))}
                {unschedExtra > 0 ? (
                  <button
                    type="button"
                    className="min-h-11 min-w-11 rounded-[4px] px-1 text-[11px] font-semibold"
                    style={{ backgroundColor: MUSTARD, color: NAVY }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDay(iso);
                    }}
                    aria-label={`${unschedExtra} more on this day`}
                  >
                    +{unschedExtra}
                  </button>
                ) : null}
              </div>

              <ProtectedBands
                windows={protectedWindows}
                dateISO={iso}
                timelineStartMin={timelineStartMin}
                timelineEndMin={timelineEndMin}
                hourPx={HOUR_PX}
                topOffset={timelineTop}
              />

              {/* Spine: 6am–11pm only */}
              <div
                className="pointer-events-none absolute z-0"
                style={{
                  left: "50%",
                  top: timelineTop,
                  height: TIMELINE_HEIGHT,
                  width: 1,
                  marginLeft: -0.5,
                  backgroundColor: SPINE,
                }}
                aria-hidden
              />

              {isTodayCol && nowMin > timelineStartMin && nowMin < timelineEndMin && (
                <div
                  className="pointer-events-none absolute left-0 right-0 z-[1]"
                  style={{
                    top: timelineTop,
                    height:
                      ((Math.min(nowMin, timelineEndMin) - timelineStartMin) / totalTimelineMin) *
                      TIMELINE_HEIGHT,
                    backgroundColor: "rgba(15, 57, 76, 0.08)",
                  }}
                  aria-hidden
                />
              )}

              {/* Current time — full column width, today only */}
              {isTodayCol && nowMin >= timelineStartMin && nowMin < timelineEndMin && (
                <div
                  className="pointer-events-none absolute left-0 right-0 z-20"
                  style={{
                    top: timelineTop + ((nowMin - timelineStartMin) / totalTimelineMin) * TIMELINE_HEIGHT,
                    height: 2,
                    backgroundColor: GOLD,
                  }}
                  aria-hidden
                />
              )}

              {shown.map(({ task, item, startMin, endMin, extra }) => {
                const topRatio = (startMin - timelineStartMin) / totalTimelineMin;
                const topPx = timelineTop + topRatio * TIMELINE_HEIGHT;
                const durationMin = Math.max(15, endMin - startMin);
                let heightPx = Math.max(18, (durationMin / 60) * HOUR_PX);
                heightPx = Math.min(heightPx, timelineBottom - topPx);
                const routine = item.type === "anchor";
                const completed = isCompletedLook(task);
                const pastRecede =
                  !completed && isTimedTaskPastToday(iso, todayISO, task, item, nowMs);
                const editable = !completed && !isRoutineMarkerId(task.id);
                const when = whenLabel(task);

                return (
                  <Fragment key={task.id}>
                    <DragBlock
                      enabled={editable}
                      canResize={editable && !routine && heightPx >= 40}
                      startMin={startMin}
                      endMin={startMin + durationMin}
                      hourPx={HOUR_PX}
                      dateISO={iso}
                      weekDates={weekISOs}
                      ariaLabel={`${routine ? "Routine, " : ""}${task.title_snapshot}, ${when}. Drag to move${routine ? " it" : ", or drag the gold bar to change the length"}.`}
                      className="absolute left-0.5 right-0.5 z-[5] overflow-hidden px-0.5 text-left"
                      style={{
                        top: topPx,
                        height: heightPx,
                        borderRadius: 4,
                        backgroundColor: routine ? "#f3efe4" : CREAM,
                        border: routine ? `1px dashed ${SPINE}` : `1px solid ${SPINE}`,
                        borderLeft: routine ? `1px dashed ${SPINE}` : `3px solid ${MUSTARD}`,
                        color: routine ? TEXT_MUTED : NAVY,
                        opacity: completed || pastRecede ? 0.45 : 1,
                      }}
                      onOpen={() => onOpenTask(task.id)}
                      onCommit={(next) =>
                        onCommitSchedule(task.id, {
                          scheduled_date: next.dateISO,
                          scheduled_time_start: minutesToHHMM(next.startMin),
                          scheduled_time_end: minutesToHHMM(next.endMin),
                        })
                      }
                    >
                      <span className="block truncate text-[12px] font-semibold leading-tight">
                        {task.title_snapshot}
                      </span>
                      {heightPx >= 34 ? (
                        <span
                          className="mt-0.5 block truncate text-[10px] font-medium leading-tight"
                          style={{ color: TEXT_MUTED }}
                        >
                          {when}
                        </span>
                      ) : null}
                    </DragBlock>
                    {extra > 0 ? (
                      <button
                        type="button"
                        className="absolute left-0.5 right-0.5 z-30 flex min-h-11 items-center justify-center rounded-[4px] text-[11px] font-semibold"
                        style={{ top: topPx + heightPx, backgroundColor: MUSTARD, color: NAVY }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenDay(iso);
                        }}
                        aria-label={`${extra} more at this time`}
                      >
                        +{extra}
                      </button>
                    ) : null}
                  </Fragment>
                );
              })}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
