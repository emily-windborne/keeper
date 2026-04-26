"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import type {
  Item,
  ItemCategory,
  ItemFlexibility,
  ItemCadencePressure,
  ItemPriority,
  ItemType,
  FrequencyType,
} from "@/data/inventory-mock";
import { computeInitialNextDueDate } from "@/lib/inventory/compute-next-due";
import { formatPreferredDays, parsePreferredDaysInput } from "@/lib/inventory/preferred-days";

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

export type CadencePreset = "daily" | "weekly" | "biweekly" | "monthly" | "custom";
const CADENCE_PRESETS: CadencePreset[] = ["daily", "weekly", "biweekly", "monthly", "custom"];

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
    setCadencePreset: (v: CadencePreset) => void;
    setCadenceCustom: (v: string) => void;
    setEstimatedDuration: (v: string) => void;
    setPriority: (v: ItemPriority) => void;
    setFlexibility: (v: ItemFlexibility) => void;
    setCadencePressure: (v: ItemCadencePressure) => void;
    setMinimumSuccessThreshold: (v: string) => void;
    setPreferredDaysText: (v: string) => void;
  },
) {
  const {
    setTitle,
    setCategory,
    setType,
    setCadencePreset,
    setCadenceCustom,
    setEstimatedDuration,
    setPriority,
    setFlexibility,
    setCadencePressure,
    setMinimumSuccessThreshold,
    setPreferredDaysText,
  } = setters;
  setTitle(item.title);
  setCategory(item.category);
  setType(item.type);
  setEstimatedDuration(`${item.estimated_minutes} min`);
  setPriority(item.priority);
  setFlexibility(item.flexibility);
  setCadencePressure(item.cadence_pressure);
  setMinimumSuccessThreshold(item.minimum_success_threshold ?? "");
  setPreferredDaysText(formatPreferredDays(item.preferred_days));

  const ft = item.frequency_type;
  if (ft === "custom") {
    setCadencePreset("custom");
    setCadenceCustom(item.notes?.trim() ? item.notes : String(item.frequency_value ?? ""));
  } else if (ft === "daily" || ft === "weekly" || ft === "biweekly" || ft === "monthly") {
    setCadencePreset(ft);
    setCadenceCustom("");
  } else {
    setCadencePreset("weekly");
    setCadenceCustom("");
  }
}

function resetEmptyForm(setters: Parameters<typeof applyItemToForm>[1]) {
  setters.setTitle("");
  setters.setCategory("Home");
  setters.setType("recurring");
  setters.setCadencePreset("weekly");
  setters.setCadenceCustom("");
  setters.setEstimatedDuration("30 min");
  setters.setPriority("Standard");
  setters.setFlexibility("Fixed");
  setters.setCadencePressure("Can slide a little");
  setters.setMinimumSuccessThreshold("");
  setters.setPreferredDaysText("");
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
  const [cadencePreset, setCadencePreset] = useState<CadencePreset>("weekly");
  const [cadenceCustom, setCadenceCustom] = useState("");
  const [estimatedDuration, setEstimatedDuration] = useState("30 min");
  const [priority, setPriority] = useState<ItemPriority>("Standard");
  const [flexibility, setFlexibility] = useState<ItemFlexibility>("Fixed");
  const [cadencePressure, setCadencePressure] = useState<ItemCadencePressure>(
    "Can slide a little",
  );
  const [minimumSuccessThreshold, setMinimumSuccessThreshold] = useState("");
  const [preferredDaysText, setPreferredDaysText] = useState("");

  useLayoutEffect(() => {
    if (initialItem) {
      applyItemToForm(initialItem, {
        setTitle,
        setCategory,
        setType,
        setCadencePreset,
        setCadenceCustom,
        setEstimatedDuration,
        setPriority,
        setFlexibility,
        setCadencePressure,
        setMinimumSuccessThreshold,
        setPreferredDaysText,
      });
    } else {
      resetEmptyForm({
        setTitle,
        setCategory,
        setType,
        setCadencePreset,
        setCadenceCustom,
        setEstimatedDuration,
        setPriority,
        setFlexibility,
        setCadencePressure,
        setMinimumSuccessThreshold,
        setPreferredDaysText,
      });
    }
  }, [initialItem]);

  const frequency = useMemo(() => {
    if (cadencePreset === "custom") {
      const match = cadenceCustom.match(/(\d+(?:\.\d+)?)/);
      const frequency_value = match ? Number(match[1]) : 1;
      return {
        frequency_type: "custom" as const,
        frequency_value: Number.isFinite(frequency_value) ? frequency_value : 1,
      };
    }
    if (cadencePreset === "biweekly") {
      return { frequency_type: "biweekly" as const, frequency_value: 1 };
    }
    const frequency_type = cadencePreset as Exclude<FrequencyType, "custom" | "biweekly">;
    return { frequency_type, frequency_value: 1 };
  }, [cadencePreset, cadenceCustom]);

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

    const customNotes = cadencePreset === "custom" ? cadenceCustom.trim() : null;
    const nowISO = new Date().toISOString();
    const preferred_days = parsePreferredDaysInput(preferredDaysText);

    let next_due_date: string | null = initialItem?.next_due_date ?? null;
    if (
      (type === "recurring" || type === "goal") &&
      next_due_date == null &&
      frequency.frequency_type != null
    ) {
      next_due_date = computeInitialNextDueDate(
        {
          type,
          frequency_type: frequency.frequency_type,
          frequency_value: frequency.frequency_value,
        },
        nowISO,
      );
    }

    const item: Item = initialItem
      ? {
          ...initialItem,
          title: trimmedTitle,
          category,
          type,
          frequency_type: frequency.frequency_type,
          frequency_value: frequency.frequency_value,
          preferred_days,
          estimated_minutes: parsedEstimatedMinutes,
          priority,
          flexibility,
          cadence_pressure: cadencePressure,
          minimum_success_threshold: minimumSuccessThreshold.trim()
            ? minimumSuccessThreshold.trim()
            : null,
          notes: customNotes,
          next_due_date,
          updated_at: nowISO,
        }
      : {
          id: createId(),
          title: trimmedTitle,
          category,
          type,
          frequency_type: frequency.frequency_type,
          frequency_value: frequency.frequency_value,
          preferred_days,
          preferred_time_of_day: null,
          estimated_minutes: parsedEstimatedMinutes,
          priority,
          flexibility,
          cadence_pressure: cadencePressure,
          minimum_success_threshold: minimumSuccessThreshold.trim()
            ? minimumSuccessThreshold.trim()
            : null,
          notes: customNotes,
          is_archived: false,
          last_completed_at: null,
          next_due_date,
          created_at: nowISO,
          updated_at: nowISO,
        };

    await onSubmit(item);
  }

  const canSubmit = Boolean(title.trim()) && parsedEstimatedMinutes != null && !disabled;

  return (
    <form
      id={formId}
      className="space-y-5"
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
          className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
        />
      </Field>

      <Field label="Category">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ItemCategory)}
          disabled={disabled}
          className="w-full appearance-none rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Type">
        <div className="grid grid-cols-3 gap-2 rounded-[10px] border border-border bg-surface-alt p-1">
          {TYPE_OPTIONS.map((opt) => {
            const active = type === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() => setType(opt.value)}
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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Cadence / Frequency">
          <div className="space-y-2">
            <select
              value={cadencePreset}
              onChange={(e) => setCadencePreset(e.target.value as CadencePreset)}
              disabled={disabled}
              className="w-full appearance-none rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
            >
              {CADENCE_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p === "custom"
                    ? "Custom"
                    : p === "biweekly"
                      ? "Biweekly"
                      : p[0].toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
            {cadencePreset === "custom" && (
              <input
                value={cadenceCustom}
                onChange={(e) => setCadenceCustom(e.target.value)}
                placeholder="e.g. Every 1.5 months"
                disabled={disabled}
                className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
              />
            )}
          </div>
        </Field>

        <Field label="Estimated duration">
          <input
            value={estimatedDuration}
            onChange={(e) => setEstimatedDuration(e.target.value)}
            placeholder="e.g. 30 min"
            disabled={disabled}
            className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
          />
        </Field>
      </div>

      <Field label="Preferred days (optional)">
        <input
          value={preferredDaysText}
          onChange={(e) => setPreferredDaysText(e.target.value)}
          placeholder='e.g. wednesday or monday, thursday'
          disabled={disabled}
          autoComplete="off"
          className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
        />
        <span className="mt-1.5 block text-xs text-ink-muted">
          Weekday names; separate with commas or spaces. Used when planning your week.
        </span>
      </Field>

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
          className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
        />
      </Field>

      <Field label="Priority">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as ItemPriority)}
          disabled={disabled}
          className="w-full appearance-none rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
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
      <span className="mb-2 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}
