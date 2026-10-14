"use client";

import { useEffect, useState } from "react";
import type {
  Item,
  ItemCategory,
  ItemCadencePressure,
  ItemFlexibility,
  ItemPriority,
  ItemType,
  FrequencyType,
} from "@/data/inventory-mock";
import type { BrainDumpItemDraft } from "@/lib/api/brain-dump-types";
import { formatClocksInText } from "@/lib/planner/clock-label";
import { formatPreferredDays, parsePreferredDaysInput } from "@/lib/inventory/preferred-days";
import { CategoryIcon } from "@/components/CategoryIcon";

function rowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return String(Date.now()) + Math.random().toString(16).slice(2);
}

const CATEGORIES: ItemCategory[] = ["Home", "Family", "Personal", "Work", "Upkeep", "Health"];
const TYPES: ItemType[] = ["recurring", "one_off", "goal", "anchor"];

function typeLabel(type: ItemType): string {
  if (type === "one_off") return "One-off";
  if (type === "goal") return "Goal";
  if (type === "anchor") return "Routine";
  return "Recurring";
}
const FREQ_OPTIONS: NonNullable<FrequencyType>[] = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "custom",
];
const TOD_OPTIONS: ("" | NonNullable<Item["preferred_time_of_day"]>)[] = [
  "",
  "morning",
  "afternoon",
  "evening",
  "anytime",
];
const PRI: ItemPriority[] = ["Critical", "Important", "Standard", "Optional"];
const FLEX: ItemFlexibility[] = ["Fixed", "Preferred window", "Flexible anytime"];
const CAD: ItemCadencePressure[] = [
  "Must stay on cadence",
  "Can slide a little",
  "Can defer",
];

type LocalDraft = BrainDumpItemDraft & { _key: string };

function clampEstimatedMinutes(n: number): number {
  return Math.min(24 * 60, Math.max(5, Math.round(n)));
}

/** Parse digits from the minutes text field; empty or invalid falls back to `fallback`. */
function resolveEstimatedMinutesFromText(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const t = raw.trim();
  if (t === "") return fallback;
  const n = parseInt(t, 10);
  if (!Number.isFinite(n)) return fallback;
  return clampEstimatedMinutes(n);
}

type BrainDumpPreviewSheetProps = {
  open: boolean;
  onClose: () => void;
  initialDrafts: BrainDumpItemDraft[];
  onConfirm: (drafts: BrainDumpItemDraft[]) => void | Promise<void>;
  saving?: boolean;
};

export function BrainDumpPreviewSheet({
  open,
  onClose,
  initialDrafts,
  onConfirm,
  saving,
}: BrainDumpPreviewSheetProps) {
  const [rows, setRows] = useState<LocalDraft[]>([]);
  const [daysByKey, setDaysByKey] = useState<Record<string, string>>({});
  const [minutesByKey, setMinutesByKey] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const next = initialDrafts.map((d) => ({
      ...d,
      _key: rowId(),
      notes: d.notes ? formatClocksInText(d.notes) : d.notes,
      minimum_success_threshold: d.minimum_success_threshold
        ? formatClocksInText(d.minimum_success_threshold)
        : d.minimum_success_threshold,
    }));
    setRows(next);
    const dt: Record<string, string> = {};
    const mt: Record<string, string> = {};
    for (const r of next) {
      dt[r._key] = formatPreferredDays(r.preferred_days);
      mt[r._key] = String(r.estimated_minutes);
    }
    setDaysByKey(dt);
    setMinutesByKey(mt);
  }, [open, initialDrafts]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  function patch(key: string, partial: Partial<BrainDumpItemDraft>) {
    setRows((prev) =>
      prev.map((d) => (d._key === key ? { ...d, ...partial } : d)),
    );
  }

  function remove(key: string) {
    setRows((prev) => prev.filter((d) => d._key !== key));
    setDaysByKey((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setMinutesByKey((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function updateDaysText(key: string, text: string) {
    setDaysByKey((prev) => ({ ...prev, [key]: text }));
    patch(key, { preferred_days: parsePreferredDaysInput(text) });
  }

  if (!open) return null;

  function draftsForSave(): BrainDumpItemDraft[] {
    return rows.map((row) => {
      const { _key, ...rest } = row;
      const minutes = resolveEstimatedMinutesFromText(minutesByKey[_key], row.estimated_minutes);
      return { ...rest, estimated_minutes: minutes };
    });
  }

  const canSave = rows.length > 0 && rows.every((d) => d.title.trim().length > 0);

  return (
    <div className="fixed inset-0 z-[75]">
      <button
        type="button"
        className="absolute inset-0 bg-black/25 backdrop-blur-[1px]"
        aria-label="Close preview"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Review inventory items"
        className="absolute bottom-0 left-0 right-0 mx-auto flex max-h-[min(92dvh,920px)] w-full max-w-shell flex-col rounded-t-[20px] border border-border bg-surface-raised shadow-[0_-12px_40px_rgba(15,57,76,0.14)] sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
      >
        <div className="flex min-h-0 flex-1 flex-col px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-8 md:px-10">
          <div className="mx-auto mb-3 h-1.5 w-12 shrink-0 rounded-full bg-ink-faint/50" aria-hidden />
          <header className="mb-3 flex shrink-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-serif text-[20px] font-normal tracking-tight text-ink">
                Review items
              </h2>
              <p className="mt-1 text-[13px] text-ink-muted">
                Edit anything below, then confirm to add to Inventory.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl px-3 py-2 text-[13px] font-medium text-ink-muted hover:bg-surface-muted/70 hover:text-ink"
            >
              Cancel
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {rows.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-ink-muted">No items to add.</p>
            ) : (
              <ul className="flex flex-col gap-4 pb-4">
                {rows.map((d, i) => (
                  <li
                    key={d._key}
                    className="rounded-[14px] border border-border bg-surface-alt/60 p-4 shadow-soft"
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <CategoryIcon category={d.category} />
                        <span className="text-[12px] font-medium uppercase tracking-wide text-ink-muted">
                          Item {i + 1}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(d._key)}
                        className="shrink-0 text-[12px] font-medium text-ink-muted hover:text-ink"
                      >
                        Remove
                      </button>
                    </div>

                    <label className="mb-3 block">
                      <span className="mb-1 block text-[12px] font-medium text-ink-muted">Title</span>
                      <input
                        value={d.title}
                        onChange={(e) => patch(d._key, { title: e.target.value })}
                        className="w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-[15px] text-ink focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/15"
                      />
                    </label>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-[12px] font-medium text-ink-muted">Category</span>
                        <select
                          value={d.category}
                          onChange={(e) => patch(d._key, { category: e.target.value as ItemCategory })}
                          className="w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-[13px] text-ink"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[12px] font-medium text-ink-muted">Type</span>
                        <select
                          value={d.type}
                          onChange={(e) => {
                            const t = e.target.value as ItemType;
                            if (t === "one_off") {
                              patch(d._key, {
                                type: t,
                                frequency_type: null,
                                frequency_value: null,
                              });
                            } else {
                              patch(d._key, {
                                type: t,
                                frequency_type: d.frequency_type ?? "weekly",
                                frequency_value: d.frequency_value ?? 1,
                              });
                            }
                          }}
                          className="w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-[13px] text-ink"
                        >
                          {TYPES.map((t) => (
                            <option key={t} value={t}>
                              {typeLabel(t)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {d.type !== "one_off" && (
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-[12px] font-medium text-ink-muted">
                            Frequency
                          </span>
                          <select
                            value={d.frequency_type ?? ""}
                            onChange={(e) => {
                              const v = e.target.value as FrequencyType | "";
                              if (!v) return;
                              patch(d._key, {
                                frequency_type: v,
                                frequency_value: v === "daily" ? 1 : d.frequency_value ?? 1,
                              });
                            }}
                            className="w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-[13px] text-ink"
                          >
                            {FREQ_OPTIONS.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[12px] font-medium text-ink-muted">
                            Frequency value
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={d.frequency_value ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              if (!raw) {
                                patch(d._key, { frequency_value: null });
                                return;
                              }
                              const n = Number(raw);
                              patch(d._key, {
                                frequency_value: Number.isFinite(n) && n > 0 ? n : 1,
                              });
                            }}
                            className="w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-[13px] text-ink"
                            placeholder="e.g. 1"
                          />
                        </label>
                      </div>
                    )}

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-[12px] font-medium text-ink-muted">
                          Minutes
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={minutesByKey[d._key] ?? String(d.estimated_minutes)}
                          onChange={(e) => {
                            setMinutesByKey((prev) => ({ ...prev, [d._key]: e.target.value }));
                          }}
                          onBlur={(e) => {
                            const resolved = resolveEstimatedMinutesFromText(
                              e.target.value,
                              d.estimated_minutes,
                            );
                            setMinutesByKey((prev) => ({ ...prev, [d._key]: String(resolved) }));
                            patch(d._key, { estimated_minutes: resolved });
                          }}
                          className="w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-[13px] text-ink"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[12px] font-medium text-ink-muted">
                          Priority
                        </span>
                        <select
                          value={d.priority}
                          onChange={(e) => patch(d._key, { priority: e.target.value as ItemPriority })}
                          className="w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-[13px] text-ink"
                        >
                          {PRI.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-[12px] font-medium text-ink-muted">
                          Flexibility
                        </span>
                        <select
                          value={d.flexibility}
                          onChange={(e) =>
                            patch(d._key, { flexibility: e.target.value as ItemFlexibility })
                          }
                          className="w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-[13px] text-ink"
                        >
                          {FLEX.map((x) => (
                            <option key={x} value={x}>
                              {x}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[12px] font-medium text-ink-muted">
                          Cadence pressure
                        </span>
                        <select
                          value={d.cadence_pressure}
                          onChange={(e) =>
                            patch(d._key, { cadence_pressure: e.target.value as ItemCadencePressure })
                          }
                          className="w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-[13px] text-ink"
                        >
                          {CAD.map((x) => (
                            <option key={x} value={x}>
                              {x}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-[12px] font-medium text-ink-muted">
                          Preferred days (optional)
                        </span>
                        <input
                          value={daysByKey[d._key] ?? ""}
                          onChange={(e) => updateDaysText(d._key, e.target.value)}
                          placeholder="e.g. monday, thursday"
                          className="w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[12px] font-medium text-ink-muted">
                          Time of day
                        </span>
                        <select
                          value={d.preferred_time_of_day ?? ""}
                          onChange={(e) => {
                            const v = e.target.value as Item["preferred_time_of_day"] | "";
                            patch(d._key, { preferred_time_of_day: v ? v : null });
                          }}
                          className="w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-[13px] text-ink"
                        >
                          {TOD_OPTIONS.map((x) => (
                            <option key={x || "none"} value={x}>
                              {!x ? "None" : x}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3">
                      <label className="block">
                        <span className="mb-1 block text-[12px] font-medium text-ink-muted">
                          Minimum success (optional)
                        </span>
                        <textarea
                          value={d.minimum_success_threshold ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            patch(d._key, {
                              minimum_success_threshold: v.length === 0 ? null : v,
                            });
                          }}
                          rows={2}
                          autoComplete="off"
                          spellCheck={true}
                          className="w-full resize-y rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-[13px] text-ink"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[12px] font-medium text-ink-muted">Notes</span>
                        <input
                          type="text"
                          value={d.notes ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            patch(d._key, { notes: v.length === 0 ? null : v });
                          }}
                          autoComplete="off"
                          className="w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-[13px] text-ink"
                        />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-border pt-3">
            <button
              type="button"
              disabled={saving || !canSave}
              onClick={() => void onConfirm(draftsForSave())}
              className="w-full rounded-[12px] bg-accent px-4 py-3.5 text-[15px] font-semibold text-surface-raised shadow-soft transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : `Add ${rows.length} to inventory`}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
