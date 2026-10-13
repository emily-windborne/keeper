"use client";

import { useEffect, useMemo, useState } from "react";
import type { Item } from "@/data/inventory-mock";
import { CategoryIcon } from "@/components/CategoryIcon";
import { toISODate } from "@/components/planner/planner-view-utils";
import type { NewPlannedTaskInput } from "@/lib/db/map-rows";

type AddMode = "quick" | "inventory";

export function AddToWeekSheet({
  open,
  onClose,
  weekDays,
  items,
  selectedDateISO,
  onAdd,
  onQuickAdd,
  initialTime,
}: {
  open: boolean;
  onClose: () => void;
  weekDays: Date[];
  items: Item[];
  selectedDateISO: string;
  initialTime?: string | null;
  onAdd: (task: NewPlannedTaskInput) => void | Promise<void>;
  onQuickAdd: (payload: {
    title: string;
    scheduled_date: string;
    scheduled_time_start: string | null;
    scheduled_time_end: string | null;
    estimated_minutes: number;
  }) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<AddMode>("quick");
  const [quickTitle, setQuickTitle] = useState("");
  const [query, setQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [assignedDateISO, setAssignedDateISO] = useState(selectedDateISO);
  const [timeStart, setTimeStart] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setMode("quick");
    setQuickTitle("");
    setQuery("");
    setSelectedItemId(null);
    setAssignedDateISO(selectedDateISO);
    setTimeStart(initialTime ?? "");
    setDurationMinutes("");
  }, [open, selectedDateISO, initialTime]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.title.toLowerCase().includes(q));
  }, [items, query]);

  function parseTimeToMinutes(t: string): number | null {
    const match = t.match(/^(\d{1,2}):(\d{2})$/);
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

  const parsedDurationMinutes = useMemo(() => {
    const trimmed = durationMinutes.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n);
  }, [durationMinutes]);

  const scheduledTimeStart = useMemo(() => {
    const t = timeStart.trim();
    if (!t) return null;
    return parseTimeToMinutes(t) == null ? null : t;
  }, [timeStart]);

  const effectiveDurationMinutes = useMemo(() => {
    if (mode === "quick") {
      return parsedDurationMinutes ?? 30;
    }
    if (selectedItem) {
      return parsedDurationMinutes ?? selectedItem.estimated_minutes;
    }
    return parsedDurationMinutes ?? 30;
  }, [mode, parsedDurationMinutes, selectedItem]);

  const scheduledTimeEnd = useMemo(() => {
    if (!scheduledTimeStart) return null;
    const startMin = parseTimeToMinutes(scheduledTimeStart);
    if (startMin == null) return null;
    return minutesToTime(startMin + effectiveDurationMinutes);
  }, [scheduledTimeStart, effectiveDurationMinutes]);

  const canSaveQuick = quickTitle.trim().length > 0;
  const canSaveInventory = Boolean(selectedItem);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
        aria-label="Close add task sheet"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Add to week"
        className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-shell rounded-t-[20px] border border-border bg-surface-raised shadow-[0_-12px_40px_rgba(15,57,76,0.12)] sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
      >
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-8 md:px-10">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-ink-faint/50" aria-hidden />
          <header className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-serif text-[20px] font-normal tracking-tight text-ink">
                Add to day
              </h2>
              <p className="mt-1 text-[13px] text-ink-muted">
                {mode === "quick"
                  ? "Name the task, pick a day, and save."
                  : "Pick something from your inventory, or switch to Quick add."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-muted/70 hover:text-ink"
            >
              Cancel
            </button>
          </header>

          <div className="mb-4 flex rounded-[10px] border border-border bg-surface-alt p-1">
            <button
              type="button"
              onClick={() => setMode("quick")}
              className={`flex-1 rounded-[8px] px-3 py-2 text-[13px] font-medium transition-colors ${
                mode === "quick"
                  ? "bg-surface-raised text-accent shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              Quick add
            </button>
            <button
              type="button"
              onClick={() => setMode("inventory")}
              className={`flex-1 rounded-[8px] px-3 py-2 text-[13px] font-medium transition-colors ${
                mode === "inventory"
                  ? "bg-surface-raised text-accent shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              From inventory
            </button>
          </div>

          <div className="space-y-4">
            {mode === "quick" && (
              <label className="block">
                <span className="mb-2 block text-[13px] font-medium text-ink-muted">
                  What do you need to do?
                </span>
                <input
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder="Task here.."
                  className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
                  autoFocus
                />
              </label>
            )}

            {mode === "inventory" && (
              <label className="block">
                <span className="mb-2 block text-[13px] font-medium text-ink-muted">
                  Search inventory
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. yoga"
                  className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
                />
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-[13px] font-medium text-ink-muted">Date</span>
              <input
                type="date"
                value={assignedDateISO}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setAssignedDateISO(v);
                }}
                className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
              />
            </label>

            <div>
              <span className="mb-2 block text-[13px] font-medium text-ink-muted">
                Next 7 days (quick pick)
              </span>
              <div className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {weekDays.map((d) => {
                  const iso = toISODate(d);
                  const selected = iso === assignedDateISO;
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => setAssignedDateISO(iso)}
                      className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-medium transition-colors ${
                        selected
                          ? "border-accent/25 bg-surface-alt text-accent"
                          : "border-border bg-surface-raised text-ink-muted"
                      }`}
                    >
                      {d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2)}{" "}
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            {mode === "inventory" && (
              <div className="max-h-[34vh] overflow-y-auto pr-1">
                <ul className="flex flex-col gap-3 pb-2">
                  {items.length === 0 && (
                    <li className="rounded-[14px] border border-dashed border-border bg-surface-alt/60 px-4 py-8 text-center text-[13px] text-ink-muted">
                      No inventory items yet. Use <span className="font-medium text-ink">Quick add</span>{" "}
                      above, or add items in <span className="font-medium text-ink">Inventory</span>.
                    </li>
                  )}
                  {items.length > 0 && filteredItems.length === 0 && (
                    <li className="rounded-[14px] border border-dashed border-border bg-surface-alt/60 px-4 py-6 text-center text-[13px] text-ink-muted">
                      No matches. Clear the search box to see all items.
                    </li>
                  )}
                  {filteredItems.map((item) => {
                    const active = item.id === selectedItemId;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedItemId(item.id)}
                          className={`w-full rounded-[14px] border bg-surface-raised p-4 text-left shadow-soft transition-colors ${
                            active ? "border-accent/25" : "border-border"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <CategoryIcon category={item.category} />
                            <div className="min-w-0 flex-1">
                              <div className="text-[15px] font-semibold text-ink">
                                {item.title}
                              </div>
                              <div className="mt-1 text-[13px] text-ink-muted">
                                {item.category} · {item.estimated_minutes} min · {item.priority}
                              </div>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-[13px] font-medium text-ink-muted">
                  Time (optional)
                </span>
                <input
                  type="time"
                  value={timeStart}
                  onChange={(e) => setTimeStart(e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[13px] font-medium text-ink-muted">
                  Duration (optional, minutes)
                </span>
                <input
                  inputMode="numeric"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  placeholder={mode === "quick" ? "default 30" : "e.g. 30"}
                  className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
                />
              </label>
            </div>

            <button
              type="button"
              disabled={mode === "quick" ? !canSaveQuick : !canSaveInventory}
              onClick={() => {
                if (mode === "quick") {
                  if (!canSaveQuick) return;
                  void onQuickAdd({
                    title: quickTitle.trim(),
                    scheduled_date: assignedDateISO,
                    scheduled_time_start: scheduledTimeStart,
                    scheduled_time_end: scheduledTimeEnd,
                    estimated_minutes: effectiveDurationMinutes,
                  });
                  return;
                }
                if (!selectedItem) return;
                const input: NewPlannedTaskInput = {
                  item_id: selectedItem.id,
                  title_snapshot: selectedItem.title,
                  scheduled_date: assignedDateISO,
                  scheduled_time_start: scheduledTimeStart,
                  scheduled_time_end: scheduledTimeEnd,
                  status: "planned",
                  priority_override: null,
                  notes: null,
                };
                void onAdd(input);
              }}
              className="w-full rounded-[10px] bg-accent px-4 py-3.5 text-base font-semibold text-surface-raised shadow-[0_6px_18px_rgba(202,165,16,0.28)] transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save
            </button>
            {mode === "inventory" && items.length > 0 && !selectedItem && (
              <p className="text-center text-[12px] text-ink-muted">
                Tap an item above to enable Save.
              </p>
            )}
            {mode === "quick" && !canSaveQuick && (
              <p className="text-center text-[12px] text-ink-muted">
                Enter a task name to save.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
