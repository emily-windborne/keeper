"use client";

import { CalendarBlank } from "@phosphor-icons/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getMonthGridCells, startOfMonth, toISODate } from "@/components/planner/planner-view-utils";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

type PlannerCalendarPopoverProps = {
  weekDayISOs: string[];
  todayISO: string;
  selectedDateISO: string;
  onSelectDate: (iso: string) => void;
};

export function PlannerCalendarPopover({
  weekDayISOs,
  todayISO,
  selectedDateISO,
  onSelectDate,
}: PlannerCalendarPopoverProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setViewMonth(startOfMonth(new Date(`${selectedDateISO}T12:00:00`)));
    }
  }, [open, selectedDateISO]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);

  const weekSet = new Set(weekDayISOs);
  const cells = getMonthGridCells(viewMonth);
  const title = viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  function shiftViewMonth(delta: -1 | 1) {
    setViewMonth((prev) => {
      const n = new Date(prev);
      n.setMonth(n.getMonth() + delta);
      return startOfMonth(n);
    });
  }

  return (
    <div ref={wrapRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg p-1 text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open calendar"
      >
        <CalendarBlank className="h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5" weight="duotone" color="currentColor" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a date"
          className="absolute left-0 top-[calc(100%+8px)] z-[80] w-[min(calc(100vw-2.5rem),280px)] rounded-2xl border border-[#E5DAD0] bg-[#FFFFFF] p-3 shadow-[0_8px_30px_rgba(15,57,76,0.12)] sm:left-auto sm:right-0"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => shiftViewMonth(-1)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-opacity hover:opacity-70"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
            <p className="min-w-0 truncate text-center text-[13px] font-medium text-ink">{title}</p>
            <button
              type="button"
              onClick={() => shiftViewMonth(1)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-opacity hover:opacity-70"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>

          <div
            className="mb-1.5 grid grid-cols-7 gap-0.5 text-center text-[9px] font-medium text-ink-muted sm:text-[10px]"
            aria-hidden
          >
            {WEEKDAYS.map((d) => (
              <div key={d} className="truncate py-0.5">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map(({ date, inMonth }, idx) => {
              const iso = toISODate(date);
              const isToday = iso === todayISO;
              const inSelectedWeek = weekSet.has(iso);
              const isSelectedDay = iso === selectedDateISO;

              let cellClass =
                "flex aspect-square min-h-[2rem] w-full items-center justify-center rounded-lg text-[13px] font-medium transition-colors ";
              if (!inMonth) {
                cellClass += "text-ink-faint opacity-40 ";
              } else {
                cellClass += "text-ink ";
              }

              if (isToday) {
                cellClass += "bg-[#caa510] text-white shadow-sm ";
              } else if (inSelectedWeek) {
                cellClass += "bg-[#F5ECC4] ";
                if (isSelectedDay) cellClass += "ring-1 ring-[#caa510]/40 ";
              } else if (isSelectedDay) {
                cellClass += "ring-1 ring-[#caa510]/50 ";
              }

              if (!isToday) {
                cellClass += inMonth ? "hover:bg-surface-alt " : "";
              }

              return (
                <button
                  key={`${iso}-${idx}`}
                  type="button"
                  onClick={() => {
                    onSelectDate(iso);
                    setOpen(false);
                  }}
                  className={cellClass}
                  aria-label={date.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
