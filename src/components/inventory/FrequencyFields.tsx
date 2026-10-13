"use client";

import { WEEKDAYS } from "@/lib/inventory/preferred-days";
import type { FrequencyUnit, RecurrenceEnd } from "@/lib/inventory/frequency";

const UNITS: { value: FrequencyUnit; label: string }[] = [
  { value: "days", label: "days" },
  { value: "weeks", label: "weeks" },
  { value: "months", label: "months" },
];

const CHIP: Record<(typeof WEEKDAYS)[number], string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export type FrequencyFormValue = {
  every: string;
  unit: FrequencyUnit;
  days: string[];
  end: RecurrenceEnd;
  endDate: string;
  endCount: string;
  times: string;
  notes: string;
};

export function FrequencyFields({
  value,
  onChange,
  disabled,
}: {
  value: FrequencyFormValue;
  onChange: (next: FrequencyFormValue) => void;
  disabled?: boolean;
}) {
  function patch(partial: Partial<FrequencyFormValue>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div className="space-y-4">
      <div>
        <span className="mb-2 block text-sm font-medium text-ink">Repeats</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-muted">Every</span>
          <input
            inputMode="decimal"
            value={value.every}
            disabled={disabled}
            onChange={(e) => patch({ every: e.target.value })}
            aria-label="Repeat every"
            className="w-20 rounded-[10px] border border-border bg-surface-raised px-3 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
          />
          <select
            value={value.unit}
            disabled={disabled}
            onChange={(e) => patch({ unit: e.target.value as FrequencyUnit })}
            aria-label="Repeat unit"
            className="min-h-11 flex-1 rounded-[10px] border border-border bg-surface-raised px-3 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
          >
            {UNITS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">
          10 days means ten days from now. It is not read as months.
        </p>
      </div>

      <div>
        <span className="mb-2 block text-sm font-medium text-ink">Which days</span>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {WEEKDAYS.map((day) => {
            const on = value.days.includes(day);
            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => {
                  const days = on ? value.days.filter((d) => d !== day) : [...value.days, day];
                  patch({ days });
                }}
                className={`min-h-11 rounded-full border px-2 text-sm font-medium disabled:opacity-60 ${
                  on
                    ? "border-accent/30 bg-accent-soft text-ink"
                    : "border-border bg-surface-raised text-ink-muted"
                }`}
              >
                {CHIP[day]}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">Leave them all off if any day is fine.</p>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-ink">Times per period</span>
        <input
          inputMode="numeric"
          value={value.times}
          disabled={disabled}
          onChange={(e) => patch({ times: e.target.value })}
          className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
        />
        <span className="mt-1.5 block text-xs text-ink-muted">
          {value.unit === "days"
            ? "How many times each day. 1 is once a day."
            : "How many times in each stretch. 3 on a weekly item is three tasks."}
        </span>
      </label>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-ink">Ends</legend>
        {(
          [
            ["never", "Never"],
            ["on_date", "On a date"],
            ["after_count", "After a number of times"],
          ] as const
        ).map(([id, label]) => (
          <label key={id} className="flex min-h-11 items-center gap-3 text-sm text-ink">
            <input
              type="radio"
              name="recurrence-end"
              checked={value.end === id}
              disabled={disabled}
              onChange={() => patch({ end: id })}
            />
            {label}
          </label>
        ))}
        {value.end === "on_date" && (
          <input
            type="date"
            value={value.endDate}
            disabled={disabled}
            onChange={(e) => patch({ endDate: e.target.value })}
            aria-label="End date"
            className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
          />
        )}
        {value.end === "after_count" && (
          <input
            inputMode="numeric"
            value={value.endCount}
            disabled={disabled}
            onChange={(e) => patch({ endCount: e.target.value })}
            aria-label="Number of times"
            placeholder="How many times"
            className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
          />
        )}
      </fieldset>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-ink">Notes</span>
        <textarea
          value={value.notes}
          disabled={disabled}
          rows={3}
          onChange={(e) => patch({ notes: e.target.value })}
          placeholder="Anything you want to remember"
          className="w-full resize-y rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
        />
        <span className="mt-1.5 block text-xs text-ink-muted">
          Notes stay notes. Changing how often this repeats will not erase them.
        </span>
      </label>
    </div>
  );
}
