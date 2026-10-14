"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import type {
  Item,
  ItemCategory,
  ItemFlexibility,
  ItemCadencePressure,
  ItemPriority,
  ItemType,
} from "@/data/inventory-mock";
import { FrequencyFields, type FrequencyFormValue } from "@/components/inventory/FrequencyFields";
import { computeInitialNextDueDate } from "@/lib/inventory/compute-next-due";
import { formatClock } from "@/lib/planner/clock-label";
import {
  clampEvery,
  frequencyTypeForInterval,
  intervalOf,
} from "@/lib/inventory/frequency";

const CATEGORY_OPTIONS: ItemCategory[] = [
  "Home",
  "Family",
  "Personal",
  "Work",
  "Upkeep",
  "Health",
];

const PRIORITY_OPTIONS: { value: ItemPriority; label: string }[] = [
  { value: "Critical", label: "Critical" },
  { value: "Important", label: "Important" },
  { value: "Standard", label: "Standard" },
  { value: "Optional", label: "Optional" },
];

const TYPE_OPTIONS: { value: ItemType; label: string }[] = [
  { value: "recurring", label: "Recurring" },
  { value: "one_off", label: "One-off" },
  { value: "goal", label: "Goal" },
  { value: "anchor", label: "Routine" },
];

const FLEXIBILITY_OPTIONS: { value: ItemFlexibility; label: string }[] = [
  { value: "Fixed", label: "Fixed" },
  { value: "Preferred window", label: "Preferred window" },
  { value: "Flexible anytime", label: "Flexible anytime" },
];

const CADENCE_PRESSURE_OPTIONS: {
  value: ItemCadencePressure;
  label: string;
}[] = [
  { value: "Must stay on cadence", label: "Must stay on cadence" },
  { value: "Can slide a little", label: "Can slide a little" },
  { value: "Can defer", label: "Can defer" },
];

const EMPTY_REPEAT: FrequencyFormValue = {
  every: "1",
  unit: "weeks",
  days: [],
  end: "never",
  endDate: "",
  endCount: "",
  times: "1",
  notes: "",
};

function repeatFromItem(item: Item): FrequencyFormValue {
  const { unit, every } = intervalOf(item);
  return {
    every: String(every),
    unit,
    days: item.preferred_days ?? [],
    end: item.recurrence_end ?? "never",
    endDate: item.recurrence_end_date?.slice(0, 10) ?? "",
    endCount: item.recurrence_end_count ? String(item.recurrence_end_count) : "",
    times: String(item.times_per_period ?? 1),
    notes: item.notes ?? "",
  };
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return String(Date.now());
}

function applyItemToForm(
  item: Item,
  setters: {
    setTitle: (v: string) => void;
    setCategory: (v: ItemCategory) => void;
    setType: (v: ItemType) => void;
    setRepeat: (v: FrequencyFormValue) => void;
    setEstimatedDuration: (v: string) => void;
    setPriority: (v: ItemPriority) => void;
    setFlexibility: (v: ItemFlexibility) => void;
    setPreferredTime: (v: Item["preferred_time_of_day"]) => void;
    setFixedStart: (v: string) => void;
    setCadencePressure: (v: ItemCadencePressure) => void;
    setMinimumSuccessThreshold: (v: string) => void;
  },
) {
  const {
    setTitle,
    setCategory,
    setType,
    setRepeat,
    setEstimatedDuration,
    setPriority,
    setFlexibility,
    setPreferredTime,
    setFixedStart,
    setCadencePressure,
    setMinimumSuccessThreshold,
  } = setters;
  setTitle(item.title);
  setCategory(item.category);
  setType(item.type);
  setEstimatedDuration(`${item.estimated_minutes} min`);
  setPriority(item.priority);
  setFlexibility(item.flexibility);
  setPreferredTime(item.preferred_time_of_day ?? "anytime");
  setFixedStart(item.fixed_start_time ?? "");
  setCadencePressure(item.cadence_pressure);
  setMinimumSuccessThreshold(item.minimum_success_threshold ?? "");
  setRepeat(repeatFromItem(item));
}

function resetEmptyForm(setters: Parameters<typeof applyItemToForm>[1]) {
  setters.setTitle("");
  setters.setCategory("Home");
  setters.setType("recurring");
  setters.setRepeat(EMPTY_REPEAT);
  setters.setEstimatedDuration("30 min");
  setters.setPriority("Standard");
  setters.setFlexibility("Fixed");
  setters.setPreferredTime("anytime");
  setters.setFixedStart("");
  setters.setCadencePressure("Can slide a little");
  setters.setMinimumSuccessThreshold("");
}

export type ItemFormProps = {
  /** `null` = new item (add) defaults */
  initialItem: Item | null;
  onSubmit: (item: Item) => void | Promise<void>;
  submitLabel: string;
  disabled?: boolean;
  /** When false, first field is not auto-focused (e.g. page already scrolled) */
  autoFocusTitle?: boolean;
  /** When set, a submit button outside the form can use `form={formId}`. */
  formId?: string;
  /** Hide the default submit button (pair with an external submit using `formId`). */
  hideSubmitButton?: boolean;
};

export function ItemForm({
  initialItem,
  onSubmit,
  submitLabel,
  disabled = false,
  autoFocusTitle = true,
  formId,
  hideSubmitButton = false,
}: ItemFormProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ItemCategory>("Home");
  const [type, setType] = useState<ItemType>("recurring");
  const [repeat, setRepeat] = useState<FrequencyFormValue>(EMPTY_REPEAT);
  const [estimatedDuration, setEstimatedDuration] = useState("30 min");
  const [priority, setPriority] = useState<ItemPriority>("Standard");
  const [flexibility, setFlexibility] = useState<ItemFlexibility>("Fixed");
  const [preferredTime, setPreferredTime] = useState<Item["preferred_time_of_day"]>("anytime");
  const [fixedStart, setFixedStart] = useState("");
  const [cadencePressure, setCadencePressure] = useState<ItemCadencePressure>(
    "Can slide a little",
  );
  const [minimumSuccessThreshold, setMinimumSuccessThreshold] = useState("");

  useLayoutEffect(() => {
    if (initialItem) {
      applyItemToForm(initialItem, {
        setTitle,
        setCategory,
        setType,
        setRepeat,
        setEstimatedDuration,
        setPriority,
        setFlexibility,
        setPreferredTime,
        setFixedStart,
        setCadencePressure,
        setMinimumSuccessThreshold,
      });
    } else {
      resetEmptyForm({
        setTitle,
        setCategory,
        setType,
        setRepeat,
        setEstimatedDuration,
        setPriority,
        setFlexibility,
        setPreferredTime,
        setFixedStart,
        setCadencePressure,
        setMinimumSuccessThreshold,
      });
    }
  }, [initialItem]);

  const parsedEstimatedMinutes = useMemo(() => {
    const match = estimatedDuration.match(/(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n);
  }, [estimatedDuration]);

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    if (parsedEstimatedMinutes == null) return;

    const repeating = type === "recurring" || type === "goal" || type === "anchor";
    const every = clampEvery(Number(repeat.every));
    const frequency_unit = repeating ? repeat.unit : null;
    const frequency_value = repeating ? every : null;
    const frequency_type = repeating ? frequencyTypeForInterval(repeat.unit, every) : null;
    const parsedTimes = Number(repeat.times);
    const times_per_period =
      !repeating || !Number.isFinite(parsedTimes)
        ? 1
        : Math.min(14, Math.max(1, Math.round(parsedTimes)));
    const preferred_days = repeating && repeat.days.length > 0 ? repeat.days : null;
    const recurrence_end = repeating ? repeat.end : "never";
    const recurrence_end_date =
      recurrence_end === "on_date" && repeat.endDate ? repeat.endDate : null;
    const endCount = Number(repeat.endCount);
    const recurrence_end_count =
      recurrence_end === "after_count" && Number.isFinite(endCount)
        ? Math.max(1, Math.round(endCount))
        : null;
    const notes = repeat.notes.trim() ? repeat.notes.trim() : null;
    const nowISO = new Date().toISOString();

    let next_due_date: string | null = initialItem?.next_due_date ?? null;
    if (repeating && next_due_date == null && frequency_type != null) {
      next_due_date = computeInitialNextDueDate(
        {
          type,
          frequency_type,
          frequency_value,
          frequency_unit,
        },
        nowISO,
      );
    }

    const shared = {
      title: trimmedTitle,
      category,
      type,
      frequency_type,
      frequency_value,
      frequency_unit,
      times_per_period,
      recurrence_end,
      recurrence_end_date,
      recurrence_end_count,
      preferred_days,
      estimated_minutes: parsedEstimatedMinutes,
      priority,
      flexibility,
      cadence_pressure: cadencePressure,
      minimum_success_threshold: minimumSuccessThreshold.trim()
        ? minimumSuccessThreshold.trim()
        : null,
      notes,
      preferred_time_of_day: preferredTime,
      fixed_start_time:
        flexibility === "Fixed" && /^([01]\d|2[0-3]):[0-5]\d$/.test(fixedStart) ? fixedStart : null,
      next_due_date,
      updated_at: nowISO,
    };

    const item: Item = initialItem
      ? {
          ...initialItem,
          ...shared,
        }
      : {
          id: createId(),
          ...shared,
          completed_count: 0,
          is_archived: false,
          last_completed_at: null,
          created_at: nowISO,
        };

    await onSubmit(item);
  }

  const canSubmit = Boolean(title.trim()) && parsedEstimatedMinutes != null && !disabled;

  return (
    <form
      id={formId}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
    >
      <Field label="Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Meal prep for Coop"
          disabled={disabled}
          autoFocus={autoFocusTitle}
          className="w-full rounded-[10px] border border-border bg-surface-raised min-h-11 px-3 py-2 text-[15px] text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
        />
      </Field>

      <Field label="Category">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ItemCategory)}
          disabled={disabled}
          className="w-full appearance-none rounded-[10px] border border-border bg-surface-raised min-h-11 px-3 py-2 text-[15px] text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Type">
        <div className="grid grid-cols-2 gap-2 rounded-[10px] border border-border bg-surface-alt p-1">
          {TYPE_OPTIONS.map((opt) => {
            const active = type === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() => setType(opt.value)}
                className={`min-h-11 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                  active
                    ? "bg-surface-raised text-accent shadow-sm"
                    : "text-ink-muted hover:bg-surface-raised/70 hover:text-ink"
                }`}
                aria-pressed={active}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Estimated duration">
        <input
          value={estimatedDuration}
          onChange={(e) => setEstimatedDuration(e.target.value)}
          placeholder="e.g. 30 min"
          disabled={disabled}
          className="w-full rounded-[10px] border border-border bg-surface-raised min-h-11 px-3 py-2 text-[15px] text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
        />
      </Field>

      {type === "one_off" ? (
        <Field label="Notes">
          <textarea
            value={repeat.notes}
            onChange={(e) => setRepeat({ ...repeat, notes: e.target.value })}
            disabled={disabled}
            rows={3}
            placeholder="Anything you want to remember"
            className="w-full resize-y rounded-[10px] border border-border bg-surface-raised min-h-11 px-3 py-2 text-[15px] text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
          />
        </Field>
      ) : (
        <FrequencyFields value={repeat} onChange={setRepeat} disabled={disabled} />
      )}

      <Field label="Flexibility">
        <div className="grid grid-cols-3 gap-2 rounded-[10px] border border-border bg-surface-alt p-1">
          {FLEXIBILITY_OPTIONS.map((opt) => {
            const active = flexibility === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() => setFlexibility(opt.value)}
                className={`rounded-[10px] px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                  active
                    ? "bg-surface-raised text-accent shadow-sm"
                    : "text-ink-muted hover:bg-surface-raised/70 hover:text-ink"
                }`}
                aria-pressed={active}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Time of day">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["morning", "Morning"],
              ["afternoon", "Afternoon"],
              ["evening", "Evening"],
              ["anytime", "Anytime"],
            ] as const
          ).map(([id, label]) => {
            const active = preferredTime === id;
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => setPreferredTime(id)}
                className={`min-h-11 rounded-[10px] border px-2 text-sm font-medium disabled:opacity-60 ${
                  active
                    ? "border-accent/30 bg-accent-soft text-ink"
                    : "border-border bg-surface-raised text-ink-muted"
                }`}
                aria-pressed={active}
              >
                {label}
              </button>
            );
          })}
        </div>
        <span className="mt-1.5 block text-xs text-ink-muted">
          Keeper uses this when it picks a time. A fixed clock time below is kept exactly.
        </span>
      </Field>

      {flexibility === "Fixed" && (
        <Field label={fixedStart ? `Starts at ${formatClock(fixedStart)}` : "Starts at"}>
          <input
            type="time"
            value={fixedStart}
            disabled={disabled}
            onChange={(e) => setFixedStart(e.target.value)}
            className="w-full rounded-[10px] border border-border bg-surface-raised min-h-11 px-3 py-2 text-[15px] text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
          />
          <span className="mt-1.5 block text-xs text-ink-muted">
            Example: Wednesday 1:00 to 4:00 PM is a 180 minute duration. Keeper will not slide it.
          </span>
        </Field>
      )}

      <Field label="Cadence pressure">
        <div className="grid grid-cols-3 gap-2 rounded-[10px] border border-border bg-surface-alt p-1">
          {CADENCE_PRESSURE_OPTIONS.map((opt) => {
            const active = cadencePressure === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() => setCadencePressure(opt.value)}
                className={`rounded-[10px] px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                  active
                    ? "bg-surface-raised text-accent shadow-sm"
                    : "text-ink-muted hover:bg-surface-raised/70 hover:text-ink"
                }`}
                aria-pressed={active}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Minimum success (optional)">
        <input
          value={minimumSuccessThreshold}
          onChange={(e) => setMinimumSuccessThreshold(e.target.value)}
          placeholder="e.g. at least 2x/week counts"
          disabled={disabled}
          className="w-full rounded-[10px] border border-border bg-surface-raised min-h-11 px-3 py-2 text-[15px] text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
        />
      </Field>

      <Field label="Priority">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as ItemPriority)}
          disabled={disabled}
          className="w-full appearance-none rounded-[10px] border border-border bg-surface-raised min-h-11 px-3 py-2 text-[15px] text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      {!hideSubmitButton ? (
        <div className="pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-[10px] bg-accent px-4 py-3.5 text-base font-semibold text-surface-raised shadow-[0_6px_18px_rgba(202,165,16,0.28)] transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitLabel}
          </button>
        </div>
      ) : null}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}
