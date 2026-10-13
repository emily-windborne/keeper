"use client";

import { useEffect, useMemo, useState } from "react";
import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";
import { CategoryIcon } from "@/components/CategoryIcon";
import { consumeBackgroundClick, DragBlock } from "@/components/planner/DragBlock";
import { parseTimeToMinutesSinceMidnight, toISODate } from "@/components/planner/planner-view-utils";
import { minutesFromPointerY, minutesToHHMM } from "@/lib/planner/time-snap";

const VIEW_BG = "#F7F2EC";
const SPINE = "#E5DAD0";
const GOLD = "#caa510";
const TEXT_MUTED = "rgba(15, 57, 76, 0.6)";
const TEXT_TIME = "rgba(15, 57, 76, 0.4)";
const TICK = "rgba(229, 218, 208, 0.55)";
const COMPLETED_CIRCLE_BG = "rgba(15, 57, 76, 0.15)";
const COMPLETED_ICON_COLOR = "rgba(15, 57, 76, 0.4)";
const MAX_VISIBLE_LANES = 2;

const CATEGORY_FILL: Record<string, string> = {
  Home: "rgba(208, 228, 235, 0.95)",
  Family: "rgba(243, 214, 200, 0.95)",
  Personal: "rgba(232, 220, 196, 0.95)",
  Work: "rgba(210, 222, 206, 0.95)",
  Health: "rgba(240, 212, 216, 0.95)",
  Upkeep: "rgba(245, 236, 196, 0.95)",
};

function categoryFill(category: string): string {
  return CATEGORY_FILL[category] ?? "rgba(246, 244, 240, 0.95)";
}

const TIMELINE_FIRST_HOUR = 6;
const TIMELINE_LAST_HOUR = 23;
const HOUR_COUNT = TIMELINE_LAST_HOUR - TIMELINE_FIRST_HOUR + 1;
/** One hour of vertical space — 60 minutes of duration maps to this height. */
const HOUR_PX = 36;
const TIMELINE_HEIGHT = HOUR_COUNT * HOUR_PX;
const UNSCHED_MIN_PX = 36;
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

function rangesIntersect(a: TimedEntry, b: TimedEntry): boolean {
  return a.rangeStart < b.rangeEnd && b.rangeStart < a.rangeEnd;
}

/** Connected components: tasks linked if their time ranges intersect (transitively). */
function overlapComponents(timed: TimedEntry[]): TimedEntry[][] {
  const visited = new Set<string>();
  const out: TimedEntry[][] = [];

  function dfs(seed: TimedEntry, acc: TimedEntry[]) {
    if (visited.has(seed.task.id)) return;
    visited.add(seed.task.id);
    acc.push(seed);
    for (const u of timed) {
      if (!visited.has(u.task.id) && rangesIntersect(seed, u)) {
        dfs(u, acc);
      }
    }
  }

  for (const t of timed) {
    if (visited.has(t.task.id)) continue;
    const comp: TimedEntry[] = [];
    dfs(t, comp);
    out.push(comp);
  }
  return out;
}

/** Greedy interval coloring within one overlap group — minimum lanes, no stacked obscuring. */
function assignLaneLayout(
  timed: TimedEntry[],
): Map<string, { lane: number; laneCount: number }> {
  const sorted = [...timed].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const lanes: TimedEntry[][] = [];
  for (const t of sorted) {
    let placed = false;
    for (let L = 0; L < lanes.length; L++) {
      const laneTasks = lanes[L];
      const last = laneTasks[laneTasks.length - 1];
      if (last.endMin <= t.startMin) {
        laneTasks.push(t);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lanes.push([t]);
    }
  }
  const laneCount = Math.max(1, lanes.length);
  const out = new Map<string, { lane: number; laneCount: number }>();
  for (let L = 0; L < lanes.length; L++) {
    for (const t of lanes[L]) {
      out.set(t.task.id, { lane: L, laneCount });
    }
  }
  return out;
}

function buildOverlapLaneMap(timed: TimedEntry[]): Map<string, { lane: number; laneCount: number }> {
  const out = new Map<string, { lane: number; laneCount: number }>();
  for (const comp of overlapComponents(timed)) {
    const local = assignLaneLayout(comp);
    for (const [id, v] of local) out.set(id, v);
  }
  return out;
}

/** Per spec: 2 overlaps → 45% each; 3 → 30% each; larger groups split evenly with small gaps. */
function horizontalLayoutForLaneCount(laneCount: number): { widthPct: number; gapPct: number } {
  if (laneCount <= 1) return { widthPct: 100, gapPct: 0 };
  if (laneCount === 2) return { widthPct: 45, gapPct: 10 };
  if (laneCount === 3) return { widthPct: 30, gapPct: 5 };
  const widthPct = 90 / laneCount;
  const gapPct = (100 - widthPct * laneCount) / (laneCount - 1);
  return { widthPct, gapPct };
}

function leftPctForLane(lane: number, widthPct: number, gapPct: number): number {
  return lane * (widthPct + gapPct);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function isCompletedLook(task: PlannedTask): boolean {
  return task.status === "done" || task.status === "skipped";
}

function TimelineColumnIcon({ task, item }: { task: PlannedTask; item: Item }) {
  if (isCompletedLook(task)) {
    return (
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: COMPLETED_CIRCLE_BG }}
        aria-hidden
      >
        <CategoryIcon
          category={item.category}
          variant="bare"
          iconColor={COMPLETED_ICON_COLOR}
          weight="fill"
        />
      </span>
    );
  }
  return <CategoryIcon category={item.category} />;
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
    <div className="w-full max-w-[390px]" style={{ backgroundColor: VIEW_BG }}>
      {!hasAnyTask ? (
        <p className="px-4 py-3 text-center text-[13px] leading-relaxed" style={{ color: TEXT_MUTED }}>
          Nothing planned yet. Tap an open time to add something.
        </p>
      ) : null}
      {/* Header row */}
      <div className="sticky top-0 z-20 flex" style={{ backgroundColor: VIEW_BG }}>
        <div className="shrink-0" style={{ width: timeGutterW }} aria-hidden />
        {weekDays.map((d) => {
          const iso = toISODate(d);
          const isToday = iso === todayISO;
          const letter = d.toLocaleDateString(undefined, { weekday: "narrow" });
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDate(iso)}
              className="min-h-[2.25rem] min-w-0 flex-1 py-1 text-center text-[12px] font-semibold tabular-nums"
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
          className="relative shrink-0"
          style={{
            width: timeGutterW,
            height: unschedBandHeight + TIMELINE_HEIGHT,
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
          const markers: TimedEntry[] = [];
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
            const durMin =
              item.type === "anchor"
                ? 15
                : endRaw != null && endRaw > startRaw
                  ? endRaw - startRaw
                  : Math.max(15, item.estimated_minutes);
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
            if (item.type === "anchor") markers.push(entry);
            else timed.push(entry);
          }

          const laneMap = buildOverlapLaneMap(timed);
          const visibleTimed = timed.filter(
            (entry) => (laneMap.get(entry.task.id)?.lane ?? 0) < MAX_VISIBLE_LANES,
          );
          const hiddenCount = timed.length - visibleTimed.length;
          const timelineTop = unschedBandHeight;
          const timelineBottom = timelineTop + TIMELINE_HEIGHT;

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
                {unscheduled.map(({ task, item }) => {
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onOpenTask(task.id)}
                      title={task.title_snapshot}
                      className="flex shrink-0 items-center justify-center rounded-full px-0.5 py-0.5 transition-opacity active:opacity-85"
                      style={{ backgroundColor: "rgba(15, 57, 76, 0.04)" }}
                      aria-label={`Task actions for ${task.title_snapshot}, no time set`}
                    >
                      <TimelineColumnIcon task={task} item={item} />
                    </button>
                  );
                })}
              </div>

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

              {markers.map(({ task, startMin, endMin }) => {
                const topRatio = (startMin - timelineStartMin) / totalTimelineMin;
                const topPx = timelineTop + topRatio * TIMELINE_HEIGHT;
                const editable = !isCompletedLook(task);
                return (
                  <DragBlock
                    key={task.id}
                    enabled={editable}
                    canResize={false}
                    startMin={startMin}
                    endMin={endMin}
                    hourPx={HOUR_PX}
                    dateISO={iso}
                    weekDates={weekISOs}
                    ariaLabel={`Routine, ${task.title_snapshot}, ${task.scheduled_time_start ?? ""}. Drag to move it.`}
                    className="absolute left-1/2 z-[6] flex h-11 w-11 -translate-x-1/2 items-center justify-center"
                    style={{ top: topPx - 8 }}
                    onOpen={() => onOpenTask(task.id)}
                    onCommit={(next) =>
                      onCommitSchedule(task.id, {
                        scheduled_date: next.dateISO,
                        scheduled_time_start: minutesToHHMM(next.startMin),
                        scheduled_time_end: minutesToHHMM(next.endMin),
                      })
                    }
                  >
                    <span className="h-2.5 w-2.5 rounded-full border border-[#caa510] bg-[#f5ecc4]" title={task.title_snapshot} />
                  </DragBlock>
                );
              })}

              {hiddenCount > 0 ? (
                <button
                  type="button"
                  className="absolute left-0 right-0 z-30 flex h-11 items-center justify-center px-0.5 text-center text-[10px] font-semibold leading-tight text-[#0f394c]"
                  style={{ top: timelineTop }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenDay(iso);
                  }}
                  aria-label={`${hiddenCount} more on this day`}
                >
                  +{hiddenCount} more
                </button>
              ) : null}

              {/* Timed pills on spine */}
              {visibleTimed.map(({ task, item, startMin, endMin }) => {
                const topRatio = (startMin - timelineStartMin) / totalTimelineMin;
                const topPx = timelineTop + topRatio * TIMELINE_HEIGHT;
                const durationMin = Math.max(15, endMin - startMin);
                let heightPx = Math.max(44, (durationMin / 60) * HOUR_PX);
                heightPx = Math.min(heightPx, timelineBottom - topPx);

                const layout = laneMap.get(task.id) ?? { lane: 0, laneCount: 1 };
                const shownLanes = Math.min(layout.laneCount, MAX_VISIBLE_LANES);
                const { widthPct, gapPct } = horizontalLayoutForLaneCount(shownLanes);
                const leftPct = leftPctForLane(layout.lane, widthPct, gapPct);

                const completed = isCompletedLook(task);
                const pastRecede =
                  !completed && isTimedTaskPastToday(iso, todayISO, task, item, nowMs);
                const editable = !completed;

                return (
                  <DragBlock
                    key={task.id}
                    enabled={editable}
                    canResize={editable}
                    startMin={startMin}
                    endMin={startMin + durationMin}
                    hourPx={HOUR_PX}
                    dateISO={iso}
                    weekDates={weekISOs}
                    ariaLabel={`${task.title_snapshot}, ${task.scheduled_time_start ?? ""}. Drag to move, or drag the gold bar to change the length.`}
                    className="absolute z-[5] flex flex-col items-center justify-start border-0 pt-1"
                    style={{
                      top: topPx,
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      height: heightPx,
                      borderRadius: 9999,
                      backgroundColor: categoryFill(item.category),
                      opacity: pastRecede ? 0.4 : 1,
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
                    <TimelineColumnIcon task={task} item={item} />
                  </DragBlock>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
