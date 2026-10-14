"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clockToMinutes, minutesToClock } from "@/lib/notifications/digest";
import { formatClockRange } from "@/lib/planner/clock-label";
import { WEEKDAY_NAMES, type ProtectedWindow } from "@/lib/planner/protected-time";
import { deleteProtectedTime, saveProtectedTime } from "@/lib/settings/protected-times";

const DAY_CHIPS: { id: (typeof WEEKDAY_NAMES)[number]; label: string }[] = [
  { id: "monday", label: "Mon" },
  { id: "tuesday", label: "Tue" },
  { id: "wednesday", label: "Wed" },
  { id: "thursday", label: "Thu" },
  { id: "friday", label: "Fri" },
  { id: "saturday", label: "Sat" },
  { id: "sunday", label: "Sun" },
];

type Draft = {
  id: string;
  name: string;
  days: string[];
  start: string;
  end: string;
};

function blankDraft(): Draft {
  return {
    id: crypto.randomUUID(),
    name: "",
    days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    start: "07:30",
    end: "09:00",
  };
}

function draftFrom(window: ProtectedWindow): Draft {
  return {
    id: window.id,
    name: window.name,
    days: window.days,
    start: minutesToClock(window.startMin),
    end: minutesToClock(window.endMin),
  };
}

export function ProtectedTimeFields({
  supabase,
  userId,
  windows,
  onChange,
  onMessage,
}: {
  supabase: SupabaseClient;
  userId: string | null;
  windows: ProtectedWindow[];
  onChange: (next: ProtectedWindow[]) => void;
  onMessage: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveDraft() {
    if (!draft) return;
    if (!userId) {
      onMessage("Sign in to save protected time.");
      return;
    }
    const name = draft.name.trim();
    const startMin = clockToMinutes(draft.start);
    const endMin = clockToMinutes(draft.end);
    if (!name) {
      onMessage("Give this block a name.");
      return;
    }
    if (draft.days.length === 0) {
      onMessage("Choose at least one day.");
      return;
    }
    if (startMin == null || endMin == null || endMin <= startMin) {
      onMessage("The end time has to be later than the start.");
      return;
    }
    setBusy(true);
    const next: ProtectedWindow = { id: draft.id, name, days: draft.days, startMin, endMin };
    const error = await saveProtectedTime(supabase, userId, next);
    setBusy(false);
    if (error) {
      onMessage(error);
      return;
    }
    const without = windows.filter((window) => window.id !== next.id);
    onChange([...without, next].sort((a, b) => a.startMin - b.startMin));
    setDraft(null);
    onMessage("Saved.");
  }

  async function remove(id: string) {
    setBusy(true);
    const error = await deleteProtectedTime(supabase, id);
    setBusy(false);
    if (error) {
      onMessage(error);
      return;
    }
    onChange(windows.filter((window) => window.id !== id));
    if (draft?.id === id) setDraft(null);
    onMessage("Deleted.");
  }

  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-ink">Protected time</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        Recurring blocks such as a school run or dinner. Plan my week and Ask Keeper leave them empty unless you name that time.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {windows.map((window) => (
          <li
            key={window.id}
            className="rounded-[10px] border border-border bg-surface-raised px-3 py-2"
          >
            <p className="text-[14px] font-medium text-ink">{window.name}</p>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              {window.days
                .map((day) => DAY_CHIPS.find((chip) => chip.id === day)?.label ?? day)
                .join(" ")}{" "}
              · {formatClockRange(minutesToClock(window.startMin), minutesToClock(window.endMin))}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="min-h-11 rounded-[10px] border border-border px-3 text-[13px] font-medium text-ink"
                onClick={() => setDraft(draftFrom(window))}
              >
                Edit
              </button>
              <button
                type="button"
                className="min-h-11 rounded-[10px] border border-border px-3 text-[13px] font-medium text-ink"
                disabled={busy}
                onClick={() => void remove(window.id)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      {draft ? (
        <div className="mt-3 rounded-[10px] border border-border bg-[#f6f4f0] p-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">Name</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Morning school run"
              className="min-h-11 w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-base text-ink outline-none"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {DAY_CHIPS.map((chip) => {
              const on = draft.days.includes(chip.id);
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={on}
                  className={`min-h-11 rounded-[10px] px-3 text-[13px] font-medium ${
                    on ? "bg-[#f5ecc4] text-[#0f394c]" : "border border-border bg-surface-raised text-ink-muted"
                  }`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      days: on ? draft.days.filter((day) => day !== chip.id) : [...draft.days, chip.id],
                    })
                  }
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label>
              <span className="mb-1 block text-sm font-medium text-ink">Start</span>
              <input
                type="time"
                value={draft.start}
                onChange={(event) => setDraft({ ...draft, start: event.target.value })}
                className="min-h-11 w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-base text-ink outline-none"
              />
            </label>
            <label>
              <span className="mb-1 block text-sm font-medium text-ink">End</span>
              <input
                type="time"
                value={draft.end}
                onChange={(event) => setDraft({ ...draft, end: event.target.value })}
                className="min-h-11 w-full rounded-[10px] border border-border bg-surface-raised px-3 py-2 text-base text-ink outline-none"
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveDraft()}
              className="min-h-11 rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-surface-raised disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save block"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="min-h-11 rounded-[10px] border border-border px-4 text-[13px] font-medium text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDraft(blankDraft())}
          className="mt-3 min-h-11 rounded-[10px] border border-border bg-surface-raised px-4 text-[13px] font-medium text-ink"
        >
          Add protected time
        </button>
      )}
    </div>
  );
}
