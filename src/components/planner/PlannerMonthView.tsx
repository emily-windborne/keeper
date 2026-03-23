"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { getMonthGridCells, toISODate } from "@/components/planner/planner-view-utils";

function formatDayDotClass(count: number): string {
  if (count <= 0) return "bg-surface-alt";
  if (count === 1) return "bg-teal-light";
  if (count <= 3) return "bg-teal";
  return "bg-accent";
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function PlannerMonthView({
  monthCursor,
  selectedDateISO,
  todayISO,
  tasksCountByDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: {
  monthCursor: Date;
  selectedDateISO: string;
  todayISO: string;
  tasksCountByDate: Map<string, number>;
  onSelectDate: (iso: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const cells = getMonthGridCells(monthCursor);
  const title = monthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrevMonth}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-opacity hover:opacity-70"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
        <p className="min-w-0 truncate text-center font-serif text-[18px] font-normal text-ink sm:text-[20px]">
          {title}
        </p>
        <button
          type="button"
          onClick={onNextMonth}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-opacity hover:opacity-70"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div
        className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-ink-muted sm:gap-1.5 sm:text-[11px]"
        aria-hidden
      >
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label="Calendar">
        {cells.map(({ date, inMonth }) => {
          const iso = toISODate(date);
          const count = tasksCountByDate.get(iso) ?? 0;
          const selected = iso === selectedDateISO;
          const isToday = iso === todayISO;
          const dotClass = formatDayDotClass(count);

          return (
            <button
              key={iso}
              type="button"
              role="gridcell"
              onClick={() => onSelectDate(iso)}
              className={`flex min-h-[2.75rem] flex-col items-center justify-center gap-0.5 rounded-xl border py-1.5 text-[13px] font-semibold transition-colors sm:min-h-[3.25rem] ${
                !inMonth ? "border-transparent text-ink-faint opacity-50" : "border-border/80 text-ink"
              } ${
                selected
                  ? "bg-accent-soft/90 text-accent ring-1 ring-accent/30"
                  : "bg-surface-raised hover:bg-surface-alt"
              } ${isToday && !selected ? "ring-1 ring-accent/25" : ""}`}
              aria-selected={selected}
              aria-label={`${date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${count ? `, ${count} tasks` : ", no tasks"}`}
            >
              <span>{date.getDate()}</span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${dotClass}`}
                aria-hidden
                title={count ? `${count} tasks` : undefined}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
