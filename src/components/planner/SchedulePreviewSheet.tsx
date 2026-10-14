"use client";

import { useEffect, useState } from "react";
import { CloseButton } from "@/components/CloseButton";
import type { SchedulePreviewRow } from "@/lib/planner/schedule-preview";
import { formatClockRange, formatClocksInText, formatDayAndRange } from "@/lib/planner/clock-label";

type ClockEdit = { date: string; start: string; end: string };

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function fromMinutes(total: number): string {
  const clamped = Math.min(23 * 60 + 59, Math.max(0, total));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function clockOf(row: SchedulePreviewRow): ClockEdit | null {
  const source = row.add ?? row.move;
  if (!source?.scheduled_date || !source.scheduled_time_start) return null;
  const start = source.scheduled_time_start.slice(0, 5);
  const end = (source.scheduled_time_end ?? source.scheduled_time_start).slice(0, 5);
  return { date: source.scheduled_date.slice(0, 10), start, end };
}

function applyClock(row: SchedulePreviewRow, edit: ClockEdit): SchedulePreviewRow {
  const detail = formatDayAndRange(edit.date, edit.start, edit.end);
  if (row.add) {
    return {
      ...row,
      detail,
      add: {
        ...row.add,
        scheduled_date: edit.date,
        scheduled_time_start: edit.start,
        scheduled_time_end: edit.end,
      },
    };
  }
  if (row.move) {
    return {
      ...row,
      detail,
      move: {
        ...row.move,
        scheduled_date: edit.date,
        scheduled_time_start: edit.start,
        scheduled_time_end: edit.end,
      },
    };
  }
  return row;
}

export function SchedulePreviewSheet({
  open,
  title,
  note,
  rows,
  saving,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  note: string;
  rows: SchedulePreviewRow[];
  saving?: boolean;
  onClose: () => void;
  onConfirm: (selected: SchedulePreviewRow[]) => void | Promise<void>;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, ClockEdit>>({});

  useEffect(() => {
    if (!open) return;
    const nextChecked: Record<string, boolean> = {};
    const nextEdits: Record<string, ClockEdit> = {};
    for (const row of rows) {
      nextChecked[row.key] = row.available;
      const clock = clockOf(row);
      if (clock) nextEdits[row.key] = clock;
    }
    setChecked(nextChecked);
    setEdits(nextEdits);
  }, [open, rows]);

  if (!open) return null;

  function patch(key: string, partial: Partial<ClockEdit>) {
    setEdits((prev) => {
      const current = prev[key];
      if (!current) return prev;
      const next = { ...current, ...partial };
      if (partial.start && partial.start !== current.start) {
        const duration = Math.max(15, minutes(current.end) - minutes(current.start));
        next.end = fromMinutes(minutes(partial.start) + duration);
      }
      return { ...prev, [key]: next };
    });
  }

  const selected = rows.filter((row) => row.available && checked[row.key]).map((row) => {
    const edit = edits[row.key];
    return edit ? applyClock(row, edit) : row;
  });

  return (
    <div className="fixed inset-0 z-[80]">
      <button type="button" className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" aria-label="Close" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute bottom-0 left-0 right-0 mx-auto flex max-h-[min(88dvh,720px)] w-full max-w-shell flex-col rounded-t-[20px] border border-border bg-surface-raised shadow-[0_-12px_40px_rgba(15,57,76,0.12)] sm:max-w-xl"
      >
        <div className="px-5 pt-3 sm:px-8">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-ink-faint/50" aria-hidden />
          <header className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-serif text-[20px] font-normal tracking-tight text-ink">{title}</h2>
            <CloseButton onClick={onClose} />
          </header>
          {note ? <p className="mb-3 text-[13px] leading-relaxed text-ink-muted">{note}</p> : null}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-8">
          {rows.map((row) => {
            const edit = edits[row.key];
            return (
              <li key={row.key} className="border-t border-border py-3">
                <label className={`flex min-h-11 items-start gap-3 ${row.available ? "" : "opacity-60"}`}>
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5"
                    checked={Boolean(checked[row.key])}
                    disabled={!row.available || saving}
                    onChange={(e) => setChecked((prev) => ({ ...prev, [row.key]: e.target.checked }))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-ink">{row.title}</span>
                    {edit ? (
                      <span className="mt-1 block text-[15px] font-semibold text-ink">
                        {formatDayAndRange(edit.date, edit.start, edit.end)}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-muted">
                        {formatClocksInText(row.detail)}
                      </span>
                    )}
                  </span>
                </label>
                {edit ? (
                  <div className="mt-2 grid grid-cols-1 gap-3 pl-8 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[12px] font-medium text-ink-muted">Date</span>
                      <input
                        type="date"
                        value={edit.date}
                        disabled={saving}
                        onChange={(event) => patch(row.key, { date: event.target.value })}
                        className="min-h-11 w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-[15px] text-ink"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[12px] font-medium text-ink-muted">
                        Time · {formatClockRange(edit.start, edit.end)}
                      </span>
                      <input
                        type="time"
                        value={edit.start}
                        disabled={saving}
                        onChange={(event) => {
                          if (event.target.value) patch(row.key, { start: event.target.value });
                        }}
                        className="min-h-11 w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-[15px] text-ink"
                      />
                    </label>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-8">
          <button
            type="button"
            disabled={saving || selected.length === 0}
            onClick={() => void onConfirm(selected)}
            className="min-h-11 w-full rounded-[10px] bg-accent px-4 py-3 text-[13px] font-semibold text-surface-raised shadow-soft disabled:opacity-50"
          >
            {saving ? "Adding…" : `Add selected (${selected.length})`}
          </button>
        </div>
      </section>
    </div>
  );
}
