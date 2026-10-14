"use client";

import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Item, ItemCategory } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";
import { getMonthGridCells, toISODate } from "@/components/planner/planner-view-utils";
import { CATEGORY_FILL } from "@/lib/planner/task-icon";
import { monthPillsForDay } from "@/lib/planner/month-pills";
import { windowsOnDate, type ProtectedWindow } from "@/lib/planner/protected-time";

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const NAVY = "#0f394c";
const MUSTARD = "#caa510";
const PROTECTED_WASH = "rgba(245, 236, 196, 0.5)";

export function PlannerMonthView({
  monthCursor,
  todayISO,
  tasks,
  itemById,
  protectedWindows = [],
  onOpenDay,
  onPrevMonth,
  onNextMonth,
  headerExtra,
}: {
  monthCursor: Date;
  todayISO: string;
  tasks: PlannedTask[];
  itemById: Map<string, Item>;
  protectedWindows?: ProtectedWindow[];
  onOpenDay: (iso: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  headerExtra?: ReactNode;
}) {
  const cells = getMonthGridCells(monthCursor);
  const weeks = Math.max(1, cells.length / 7);
  const title = monthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const swipe = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const suppressClick = useRef(false);

  const byDate = new Map<string, PlannedTask[]>();
  for (const task of tasks) {
    if (task.status === "skipped") continue;
    const list = byDate.get(task.scheduled_date) ?? [];
    list.push(task);
    byDate.set(task.scheduled_date, list);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    suppressClick.current = false;
    const target = event.target as HTMLElement;
    if (target.closest("[data-month-arrow]")) return;
    const start = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    swipe.current = start;
    const finish = (ev: PointerEvent) => {
      if (ev.pointerId !== start.pointerId) return;
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (swipe.current !== start) return;
      swipe.current = null;
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      suppressClick.current = true;
      if (dx < 0) onNextMonth();
      else onPrevMonth();
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function onClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
    >
      <div className="mb-1 flex items-center justify-center gap-1">
        <button
          type="button"
          data-month-arrow
          onClick={onPrevMonth}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#0f394c]/70"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-[15px] font-medium text-[#0f394c]">{title}</p>
        {headerExtra}
        <button
          type="button"
          data-month-arrow
          onClick={onNextMonth}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#0f394c]/70"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-7" aria-hidden>
        {WEEKDAY_LETTERS.map((letter, index) => {
          const today = new Date(`${todayISO}T12:00:00`);
          const todayInMonth =
            today.getFullYear() === monthCursor.getFullYear() && today.getMonth() === monthCursor.getMonth();
          const isTodayCol = todayInMonth && today.getDay() === index;
          return (
            <div
              key={`${letter}-${index}`}
              className="pb-1 text-center text-[11px] font-semibold"
              style={{ color: isTodayCol ? MUSTARD : "rgba(15, 57, 76, 0.45)" }}
            >
              {letter}
            </div>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
      <div
        className="grid min-h-full grid-cols-7 gap-y-0.5"
        role="grid"
        aria-label={title}
        style={{ gridTemplateRows: `repeat(${weeks}, minmax(5rem, 1fr))` }}
      >
        {cells.map(({ date, inMonth }) => {
          const iso = toISODate(date);
          const dayTasks = byDate.get(iso) ?? [];
          const laid = monthPillsForDay(
            dayTasks.map((task) => ({
              id: task.id,
              title: task.title_snapshot,
              start: task.scheduled_time_start,
              category: itemById.get(task.item_id)?.category ?? "Personal",
            })),
          );
          const isToday = iso === todayISO;
          const protectedToday = windowsOnDate(protectedWindows, iso).length > 0;
          const names = laid.pills.map((pill) => pill.title);
          const more =
            laid.extra > 0 ? `${laid.extra} more` : names.length === 0 ? "nothing planned" : null;
          const labelParts = [
            date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
            protectedToday ? "protected time" : null,
            names.length ? names.join(", ") : null,
            more,
          ].filter(Boolean);

          return (
            <button
              key={iso}
              type="button"
              role="gridcell"
              data-month-day={iso}
              onClick={() => onOpenDay(iso)}
              className="flex min-h-11 flex-col items-stretch gap-px overflow-hidden rounded-[4px] px-px pb-px pt-0.5 text-left"
              style={{
                backgroundColor: protectedToday ? PROTECTED_WASH : "transparent",
                opacity: inMonth ? 1 : 0.38,
              }}
              aria-current={isToday ? "date" : undefined}
              aria-label={labelParts.join(", ")}
            >
              <span
                className={`self-start text-[11px] font-semibold leading-none ${
                  isToday
                    ? "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-0.5"
                    : ""
                }`}
                style={isToday ? { backgroundColor: MUSTARD, color: NAVY } : { color: NAVY }}
              >
                {date.getDate()}
              </span>
              {laid.pills.map((pill) => (
                <span
                  key={pill.id}
                  className="block truncate rounded-[3px] px-0.5 text-left text-[9px] font-medium leading-[12px]"
                  style={{ backgroundColor: CATEGORY_FILL[pill.category as ItemCategory], color: NAVY }}
                >
                  {pill.title}
                </span>
              ))}
              {laid.extra > 0 ? (
                <span className="truncate text-[9px] font-semibold leading-[12px]" style={{ color: NAVY }}>
                  +{laid.extra}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}
