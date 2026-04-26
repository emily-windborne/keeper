"use client";

import { useEffect, useMemo, useState } from "react";
import type { Item } from "@/data/inventory-mock";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ItemForm } from "@/components/inventory/ItemForm";
import type { PlannedTask } from "@/lib/db/map-rows";

type EditTab = "instance" | "all";

function parseTimeToMinutes(t: string): number | null {
  const match = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function durationMinutesForTask(task: PlannedTask, item: Item): number {
  if (task.scheduled_time_start && task.scheduled_time_end) {
    const [sh, sm] = task.scheduled_time_start.split(":").map(Number);
    const [eh, em] = task.scheduled_time_end.split(":").map(Number);
    const diff = eh * 60 + em - (sh * 60 + sm);
    return Number.isFinite(diff) && diff > 0 ? diff : item.estimated_minutes;
  }
  return item.estimated_minutes;
}

export type PlannerTaskEditSheetProps = {
  open: boolean;
  sessionKey: number;
  task: PlannedTask | null;
  item: Item | null;
  onClose: () => void;
  onSaveInstance: (
    taskId: string,
    patch: {
      scheduled_date: string;
      scheduled_time_start: string | null;
      scheduled_time_end: string | null;
      notes: string | null;
    },
  ) => Promise<boolean>;
  onSaveItem: (item: Item) => Promise<boolean>;
};

export function PlannerTaskEditSheet({
  open,
  sessionKey,
  task,
  item,
  onClose,
  onSaveInstance,
  onSaveItem,
}: PlannerTaskEditSheetProps) {
  const itemFormDomId = `planner-task-edit-form-${sessionKey}`;
  const [tab, setTab] = useState<EditTab>("instance");
  const [eventDate, setEventDate] = useState("");
  const [eventTimeStart, setEventTimeStart] = useState("");
  const [eventDuration, setEventDuration] = useState("");
  const [eventNotes, setEventNotes] = useState("");
  const [savingInstance, setSavingInstance] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  useEffect(() => {
    if (!open || !task || !item) return;
    setTab("instance");
    setEventDate(task.scheduled_date);
    setEventTimeStart(task.scheduled_time_start ?? "");
    setEventDuration(String(durationMinutesForTask(task, item)));
    setEventNotes(task.notes ?? "");
    // Re-init only when a new edit session starts (avoids resetting if `item` reference churns).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- task/item read when open + sessionKey change
  }, [open, sessionKey]);

  const parsedDuration = useMemo(() => {
    const trimmed = eventDuration.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n);
  }, [eventDuration]);

  const scheduledTimeStart = useMemo(() => {
    const t = eventTimeStart.trim();
    if (!t) return null;
    return parseTimeToMinutes(t) == null ? null : t;
  }, [eventTimeStart]);

  const effectiveDuration = useMemo(() => {
    if (!item) return 30;
    return parsedDuration ?? item.estimated_minutes;
  }, [parsedDuration, item]);

  const scheduledTimeEnd = useMemo(() => {
    if (!scheduledTimeStart) return null;
    const startMin = parseTimeToMinutes(scheduledTimeStart);
    if (startMin == null) return null;
    return minutesToTime(startMin + effectiveDuration);
  }, [scheduledTimeStart, effectiveDuration]);

  const canSaveInstance = Boolean(eventDate.trim()) && !savingInstance && !savingItem;

  async function handleSaveInstance() {
    if (!task || !item || !canSaveInstance) return;
    setSavingInstance(true);
    try {
      const date = eventDate.trim();
      const start = scheduledTimeStart;
      const end = start ? scheduledTimeEnd : null;
      const ok = await onSaveInstance(task.id, {
        scheduled_date: date,
        scheduled_time_start: start,
        scheduled_time_end: end,
        notes: eventNotes.trim() ? eventNotes.trim() : null,
      });
      if (ok) onClose();
    } finally {
      setSavingInstance(false);
    }
  }

  if (!open || !task || !item) return null;

  return (
    <div className="fixed inset-0 z-[72]">
      <button
        type="button"
        className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
        aria-label="Close edit"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Edit planned task"
        className="absolute bottom-0 left-0 right-0 mx-auto flex max-h-[min(92vh,calc(100dvh-1rem))] w-full max-w-shell flex-col rounded-t-[20px] border border-border bg-surface-raised shadow-[0_-12px_40px_rgba(15,57,76,0.12)] sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
      >
        <div className="flex min-h-0 flex-1 flex-col px-5 pt-4 sm:px-8 md:px-10">
          <div className="mx-auto mb-4 h-1.5 w-12 shrink-0 rounded-full bg-ink-faint/50" aria-hidden />

          <header className="mb-4 flex shrink-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <CategoryIcon category={item.category} />
                <div className="min-w-0">
                  <h2 className="font-serif text-[20px] font-normal tracking-tight text-ink">Edit</h2>
                  <div className="mt-1 text-[13px] font-semibold text-ink">{task.title_snapshot}</div>
                  <div className="mt-0.5 text-[12px] text-ink-muted">
                    {item.category} · {item.estimated_minutes} min default
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-muted/70 hover:text-ink"
            >
              Close
            </button>
          </header>

          <div className="mb-4 flex shrink-0 rounded-[10px] border border-border bg-surface-alt p-1">
            <button
              type="button"
              onClick={() => setTab("instance")}
              className={`flex-1 rounded-[8px] px-3 py-2 text-[13px] font-medium transition-colors ${
                tab === "instance"
                  ? "bg-surface-raised text-accent shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              This event
            </button>
            <button
              type="button"
              onClick={() => setTab("all")}
              className={`flex-1 rounded-[8px] px-3 py-2 text-[13px] font-medium transition-colors ${
                tab === "all"
                  ? "bg-surface-raised text-accent shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              All events
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className={tab === "instance" ? "block space-y-4 pb-4" : "hidden"}>
              <label className="block">
                <span className="mb-2 block text-[13px] font-medium text-ink-muted">Date</span>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
                />
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-[13px] font-medium text-ink-muted">
                    Time (optional)
                  </span>
                  <input
                    type="time"
                    value={eventTimeStart}
                    onChange={(e) => setEventTimeStart(e.target.value)}
                    className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-[13px] font-medium text-ink-muted">
                    Duration (minutes)
                  </span>
                  <input
                    inputMode="numeric"
                    value={eventDuration}
                    onChange={(e) => setEventDuration(e.target.value)}
                    placeholder={`e.g. ${item.estimated_minutes}`}
                    className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-[13px] font-medium text-ink-muted">Notes</span>
                <textarea
                  value={eventNotes}
                  onChange={(e) => setEventNotes(e.target.value)}
                  rows={3}
                  placeholder="Notes for this planned instance…"
                  className="w-full resize-y rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
                />
              </label>
            </div>

            <div className={tab === "all" ? "block pb-4" : "hidden"}>
              <p className="mb-4 text-[13px] leading-relaxed text-ink-muted">
                Changes apply to the inventory item and every time you plan it, not only this day.
              </p>
              <ItemForm
                key={`${sessionKey}-${item.id}`}
                formId={itemFormDomId}
                hideSubmitButton
                initialItem={item}
                submitLabel={savingItem ? "Saving…" : "Save"}
                disabled={savingItem || savingInstance}
                autoFocusTitle={false}
                onSubmit={async (updated) => {
                  setSavingItem(true);
                  try {
                    const ok = await onSaveItem(updated);
                    if (ok) onClose();
                  } finally {
                    setSavingItem(false);
                  }
                }}
              />
            </div>
          </div>

          <div className="shrink-0 border-t border-border bg-surface-raised py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {tab === "instance" ? (
              <button
                type="button"
                disabled={!canSaveInstance}
                onClick={() => void handleSaveInstance()}
                className="w-full rounded-[10px] bg-accent px-4 py-3.5 text-base font-semibold text-surface-raised shadow-[0_6px_18px_rgba(202,165,16,0.28)] transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingInstance ? "Saving…" : "Save"}
              </button>
            ) : (
              <button
                type="submit"
                form={itemFormDomId}
                disabled={savingItem || savingInstance}
                className="w-full rounded-[10px] bg-accent px-4 py-3.5 text-base font-semibold text-surface-raised shadow-[0_6px_18px_rgba(202,165,16,0.28)] transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingItem ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default PlannerTaskEditSheet;
