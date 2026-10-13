"use client";

import { useEffect, useState } from "react";
import type { SchedulePreviewRow } from "@/lib/planner/schedule-preview";

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

  useEffect(() => {
    if (!open) return;
    const next: Record<string, boolean> = {};
    for (const row of rows) next[row.key] = row.available;
    setChecked(next);
  }, [open, rows]);

  if (!open) return null;

  const selected = rows.filter((row) => row.available && checked[row.key]);

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
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl px-3 py-2 text-[13px] font-medium text-ink-muted hover:bg-surface-muted/70 hover:text-ink"
            >
              Cancel
            </button>
          </header>
          {note ? <p className="mb-3 text-[13px] leading-relaxed text-ink-muted">{note}</p> : null}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-8">
          {rows.map((row) => (
            <li key={row.key} className="border-t border-border">
              <label className={`flex min-h-11 items-start gap-3 py-3 ${row.available ? "" : "opacity-60"}`}>
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  checked={Boolean(checked[row.key])}
                  disabled={!row.available || saving}
                  onChange={(e) => setChecked((prev) => ({ ...prev, [row.key]: e.target.checked }))}
                />
                <span>
                  <span className="block text-[14px] font-medium text-ink">{row.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-muted">{row.detail}</span>
                </span>
              </label>
            </li>
          ))}
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
