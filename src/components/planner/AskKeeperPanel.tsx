"use client";

import { useEffect, useState } from "react";
import type { RefineApiAction } from "@/lib/api/refine-types";

const REFINE_CHIPS_SHEET: { label: string; action: RefineApiAction }[] = [
  { label: "Lighten today", action: "lighten_day" },
  { label: "1 hour tonight", action: "one_hour" },
  { label: "Rebalance week", action: "rebalance" },
];

export function AskKeeperPanel({
  open,
  onOpenChange,
  disabled,
  refiningLabel,
  parsingBrainDump,
  planningWeek,
  onPlanMyWeek,
  onRefine,
  onBrainDumpParse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  refiningLabel: string | null;
  parsingBrainDump?: boolean;
  planningWeek?: boolean;
  onPlanMyWeek: () => void | Promise<void>;
  onRefine: (action: RefineApiAction, chipLabel: string, customPrompt?: string) => void | Promise<void>;
  onBrainDumpParse: (text: string) => void | Promise<void>;
}) {
  const [customLine, setCustomLine] = useState("");
  const [brainDump, setBrainDump] = useState("");

  const busy = Boolean(refiningLabel || parsingBrainDump || planningWeek);

  useEffect(() => {
    if (!open) {
      setCustomLine("");
      setBrainDump("");
    }
  }, [open]);

  function close() {
    onOpenChange(false);
  }

  function pickChip(action: RefineApiAction, label: string) {
    close();
    void onRefine(action, label);
  }

  function runPlanMyWeek() {
    close();
    void onPlanMyWeek();
  }

  function submitCustom() {
    const t = customLine.trim();
    if (!t) return;
    close();
    void onRefine("custom", "Custom", t);
  }

  function submitBrainDump() {
    const t = brainDump.trim();
    if (!t) return;
    void onBrainDumpParse(t);
  }

  return (
    <>
      {!open && (
        <div className="pointer-events-none fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+1.375rem)] left-0 right-0 z-[55] flex justify-center px-5">
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => onOpenChange(true)}
            className="pointer-events-auto rounded-full bg-[#0f394c] px-4 py-2 text-[13px] font-medium text-white shadow-soft transition-opacity hover:opacity-[0.96] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "…" : "Ask Keeper"}
          </button>
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
            aria-label="Close"
            onClick={close}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Ask Keeper"
            className="absolute bottom-0 left-0 right-0 mx-auto max-h-[min(88dvh,720px)] w-full max-w-shell overflow-y-auto rounded-t-[20px] border border-border bg-surface-raised shadow-[0_-12px_40px_rgba(15,57,76,0.12)] sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
          >
            <div className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-8 md:px-10">
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-ink-faint/50" aria-hidden />
              <header className="mb-4 flex items-center justify-between gap-3">
                <h2 className="font-serif text-[20px] font-normal tracking-tight text-ink">Ask Keeper</h2>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-xl px-3 py-2 text-[13px] font-medium text-ink-muted hover:bg-surface-muted/70 hover:text-ink"
                >
                  Cancel
                </button>
              </header>

              <div className="mb-5 rounded-[14px] border border-border bg-surface-alt/70 p-4">
                <p className="text-[13px] font-medium text-ink">Add to inventory from notes</p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                  Paste routines, recurring tasks, and responsibilities. Keeper will suggest structured
                  items you can edit before saving.
                </p>
                <textarea
                  value={brainDump}
                  onChange={(e) => setBrainDump(e.target.value)}
                  placeholder="Brain dump: e.g. trash every Tuesday, kids swim Wed evening, quarterly HVAC filter…"
                  rows={4}
                  className="mt-3 w-full resize-y rounded-[10px] border border-border bg-surface-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-faint focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/15"
                />
                <button
                  type="button"
                  disabled={disabled || busy || !brainDump.trim()}
                  onClick={() => submitBrainDump()}
                  className="mt-3 w-full rounded-[10px] bg-[#0f394c] px-4 py-2.5 text-[13px] font-semibold text-white shadow-soft transition-opacity hover:opacity-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {parsingBrainDump ? "Parsing…" : "Parse into items"}
                </button>
              </div>

              <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-muted">
                Planner
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => runPlanMyWeek()}
                  className="shrink-0 rounded-full border border-border bg-surface-alt px-3 py-2 text-[13px] font-medium text-ink-muted shadow-sm transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {planningWeek ? "Planning…" : "Plan my week"}
                </button>
                {REFINE_CHIPS_SHEET.map(({ label, action }) => (
                  <button
                    key={label}
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => pickChip(action, label)}
                    className="shrink-0 rounded-full border border-border bg-surface-alt px-3 py-2 text-[13px] font-medium text-ink-muted shadow-sm transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={customLine}
                  onChange={(e) => setCustomLine(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitCustom();
                    }
                  }}
                  placeholder="Or type a custom planner request"
                  className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-faint focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/15"
                />
                <button
                  type="button"
                  disabled={disabled || busy || !customLine.trim()}
                  onClick={() => submitCustom()}
                  className="shrink-0 rounded-[10px] border border-border bg-surface-alt px-3 py-2 text-[13px] font-medium text-ink hover:border-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
