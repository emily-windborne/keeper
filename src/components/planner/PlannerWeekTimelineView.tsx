"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";
import { ProtectedBands } from "@/components/planner/ProtectedBands";
import { TaskIcon } from "@/components/planner/TaskIcon";
import type { ProtectedWindow } from "@/lib/planner/protected-time";
import { parseTimeToMinutesSinceMidnight, toISODate } from "@/components/planner/planner-view-utils";
import { formatClockRange } from "@/lib/planner/clock-label";
import { routineMinutes } from "@/lib/planner/routine-markers";
import { minutesToHHMM } from "@/lib/planner/time-snap";
import { layoutWeekIcons } from "@/lib/planner/week-icons";

const VIEW_BG = "#F7F2EC";
const SPINE = "#E5DAD0";
const GOLD = "#caa510";
const TEXT_MUTED = "rgba(15, 57, 76, 0.6)";
const TEXT_TIME = "rgba(15, 57, 76, 0.4)";
const TICK = "rgba(229, 218, 208, 0.55)";
const NAVY = "#0f394c";
const MUSTARD = "#caa510";

const TIMELINE_FIRST_HOUR = 7;
const TIMELINE_LAST_HOUR = 23;
const HOUR_COUNT = TIMELINE_LAST_HOUR - TIMELINE_FIRST_HOUR + 1;
const HOUR_PX = 36;
const TIMELINE_HEIGHT = HOUR_COUNT * HOUR_PX;
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
  startMin: number;
  endMin: number;
  rangeStart: number;
  rangeEnd: number;
  title: string;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function isCompletedLook(task: PlannedTask): boolean {
  return task.status === "done" || task.status === "skipped";
}

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

type PopoverState = {
  taskId: string;
  title: string;
  when: string;
  top: number;
  left: number;
};

function popoverPosition(button: HTMLButtonElement): { top: number; left: number } {
  const rect = button.getBoundingClientRect();
  const width = 220;
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8));
  const below = rect.bottom + 6;
  const top = below + 76 > window.innerHeight ? Math.max(8, rect.top - 82) : below;
  return { top, left };
}

export function PlannerWeekTimelineView({
  weekDays,
  plannedTasks,
  itemById,
  selectedDateISO,
  todayISO,
  onOpenTask,
  onOpenDay,
  protectedWindows = [],
}: {
  weekDays: Date[];
  plannedTasks: PlannedTask[];
  itemById: Map<string, Item>;
  selectedDateISO: string;
  todayISO: string;
  onOpenTask: (taskId: string) => void;
  onOpenDay: (dateISO: string) => void;
  protectedWindows?: ProtectedWindow[];
}) {
  const weekISOs = useMemo(() => weekDays.map((d) => toISODate(d)), [weekDays]);
  const { nowMin, nowMs } = usePlannerNow();
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const weekKey = weekISOs.join(",");
  useEffect(() => {
    setPopover(null);
  }, [selectedDateISO, weekKey]);

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
        if (parsed == null || parsed < timelineStartMin) n += 1;
      }
      maxN = Math.max(maxN, n);
    }
    if (maxN === 0) return 0;
    return Math.min(88, 8 + Math.min(maxN, 2) * 36);
  }, [tasksByDate, weekISOs, itemById]);

  const timeGutterW = "1.65rem";

  function openPopover(button: HTMLButtonElement, taskId: string, title: string, when: string) {
    const pos = popoverPosition(button);
    setPopover({ taskId, title, when, ...pos });
  }

  return (
    <div className="w-full" style={{ backgroundColor: VIEW_BG }}>
      {!hasAnyTask ? (
        <p className="px-4 py-3 text-center text-[13px] leading-relaxed" style={{ color: TEXT_MUTED }}>
          Nothing planned yet.
        </p>
      ) : null}
      <div className="sticky top-0 z-20 flex" style={{ backgroundColor: VIEW_BG }}>
        <div className="shrink-0" style={{ width: timeGutterW, backgroundColor: VIEW_BG }} aria-hidden />
        {weekDays.map((d) => {
          const iso = toISODate(d);
          const isToday = iso === todayISO;
          const letter = d.toLocaleDateString(undefined, { weekday: "narrow" });
          const dayName = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onOpenDay(iso)}
              className="min-h-11 min-w-0 flex-1 py-1 text-center text-[13px] font-semibold tabular-nums"
              style={{ color: isToday ? GOLD : TEXT_MUTED }}
              aria-current={isToday ? "date" : undefined}
              aria-label={`Open ${dayName}`}
            >
              {letter} {d.getDate()}
            </button>
          );
        })}
      </div>

      <div className="flex">
        <div
          className="sticky left-0 z-30 shrink-0"
          style={{
            width: timeGutterW,
            height: unschedBandHeight + TIMELINE_HEIGHT,
            backgroundColor: VIEW_BG,
          }}
        >
          {unschedBandHeight > 0 ? (
            <div
              className="border-b border-dashed"
              style={{ height: unschedBandHeight, borderColor: SPINE }}
              aria-hidden
            />
          ) : null}
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
                <span
                  className="pointer-events-none absolute right-0 top-1.5 block h-px w-1.5"
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
          const loose: { task: PlannedTask; item: Item; when: string }[] = [];
          const isTodayCol = iso === todayISO;

          for (const task of dayTasks) {
            const item = itemById.get(task.item_id);
            if (!item) continue;
            const startRaw = task.scheduled_time_start
              ? parseTimeToMinutesSinceMidnight(task.scheduled_time_start)
              : null;
            if (startRaw == null || startRaw < timelineStartMin) {
              loose.push({
                task,
                item,
                when:
                  startRaw == null
                    ? "No time set"
                    : formatClockRange(task.scheduled_time_start, task.scheduled_time_end),
              });
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
            timed.push({
              task,
              item,
              startMin,
              endMin: clamp(rangeEnd, startMin + 1, timelineEndMin),
              rangeStart: startRaw,
              rangeEnd,
              title: task.title_snapshot,
            });
          }

          const shown = layoutWeekIcons(timed);
          const looseVisible = loose.slice(0, 2);
          const looseExtra = loose.length - looseVisible.length;
          const timelineTop = unschedBandHeight;

          return (
            <div
              key={iso}
              data-day-column={iso}
              className="relative min-w-0 flex-1"
              style={{
                height: unschedBandHeight + TIMELINE_HEIGHT,
                backgroundColor: VIEW_BG,
                opacity: iso < todayISO ? 0.45 : 1,
              }}
            >
              {unschedBandHeight > 0 ? (
                <div
                  className="absolute left-0 right-0 z-10 flex flex-col items-center gap-1 border-b border-dashed px-0.5 pt-1"
                  style={{ top: 0, height: unschedBandHeight, borderColor: SPINE }}
                >
                  {looseVisible.map(({ task, item, when }) => (
                    <button
                      key={task.id}
                      type="button"
                      data-task
                      className="inline-flex h-11 w-11 items-center justify-center"
                      aria-label={`${task.title_snapshot}, ${when}`}
                      onClick={(event) =>
                        openPopover(event.currentTarget, task.id, task.title_snapshot, when)
                      }
                    >
                      <TaskIcon
                        title={task.title_snapshot}
                        category={item.category}
                        override={item.icon}
                        size={26}
                      />
                    </button>
                  ))}
                  {looseExtra > 0 ? (
                    <button
                      type="button"
                      className="min-h-11 min-w-11 rounded-[4px] px-1 text-[11px] font-semibold"
                      style={{ backgroundColor: MUSTARD, color: NAVY }}
                      onClick={() => onOpenDay(iso)}
                      aria-label={`${looseExtra} more on this day`}
                    >
                      +{looseExtra}
                    </button>
                  ) : null}
                </div>
              ) : null}

              <ProtectedBands
                windows={protectedWindows}
                dateISO={iso}
                timelineStartMin={timelineStartMin}
                timelineEndMin={timelineEndMin}
                hourPx={HOUR_PX}
                topOffset={timelineTop}
              />

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
                    height: ((Math.min(nowMin, timelineEndMin) - timelineStartMin) / totalTimelineMin) * TIMELINE_HEIGHT,
                    backgroundColor: "rgba(15, 57, 76, 0.08)",
                  }}
                  aria-hidden
                />
              )}

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

              {shown.map(({ task, item, startMin, endMin, rangeStart, rangeEnd, lane, extra }) => {
                const durationMin = Math.max(15, endMin - startMin);
                const topPx =
                  timelineTop + ((startMin - timelineStartMin) / totalTimelineMin) * TIMELINE_HEIGHT;
                const routine = item.type === "anchor";
                const completed = isCompletedLook(task);
                const pastRecede = !completed && isTimedTaskPastToday(iso, todayISO, task, item, nowMs);
                const when = routine
                  ? formatClockRange(minutesToHHMM(startMin), minutesToHHMM(startMin + durationMin))
                  : formatClockRange(task.scheduled_time_start, task.scheduled_time_end);
                const paired = shown.some(
                  (other) =>
                    other.task.id !== task.id &&
                    other.lane !== lane &&
                    other.rangeStart < rangeEnd &&
                    rangeStart < other.rangeEnd,
                );
                const size = paired ? 22 : 28;

                return (
                  <div key={task.id}>
                    <button
                      type="button"
                      data-task
                      data-week-icon
                      aria-label={`${routine ? "Routine, " : ""}${task.title_snapshot}, ${when}`}
                      className="absolute z-[5] inline-flex items-start justify-center"
                      style={{
                        top: topPx,
                        width: paired ? size + 4 : "100%",
                        height: paired ? size + 4 : 44,
                        left: paired ? (lane === 0 ? 0 : undefined) : "50%",
                        right: paired && lane === 1 ? 0 : undefined,
                        transform: paired ? undefined : "translateX(-50%)",
                        opacity: completed || pastRecede ? 0.45 : routine ? 0.8 : 1,
                      }}
                      onClick={(event) =>
                        openPopover(event.currentTarget, task.id, task.title_snapshot, when)
                      }
                    >
                      <TaskIcon
                        title={task.title_snapshot}
                        category={item.category}
                        override={item.icon}
                        size={size}
                      />
                    </button>
                    {extra > 0 ? (
                      <button
                        type="button"
                        className="absolute left-0.5 right-0.5 z-30 flex min-h-11 items-center justify-center rounded-[4px] text-[11px] font-semibold"
                        style={{ top: topPx + size + 6, backgroundColor: MUSTARD, color: NAVY }}
                        onClick={() => onOpenDay(iso)}
                        aria-label={`${extra} more at this time`}
                      >
                        +{extra}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {popover ? (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Dismiss"
            onClick={() => setPopover(null)}
          />
          <div
            role="dialog"
            aria-label={popover.title}
            className="absolute flex w-[220px] items-center gap-2 rounded-[12px] border border-[#e5dad0] bg-[#f6f4f0] px-3 py-2 shadow-[0_8px_24px_rgba(15,57,76,0.12)]"
            style={{ top: popover.top, left: popover.left }}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-[#0f394c]">{popover.title}</p>
              <p className="truncate text-[12px] text-[#0f394c]/65">{popover.when}</p>
            </div>
            <button
              type="button"
              aria-label={`Edit ${popover.title}`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#0f394c]"
              onClick={() => {
                const taskId = popover.taskId;
                setPopover(null);
                onOpenTask(taskId);
              }}
            >
              <Pencil size={18} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
