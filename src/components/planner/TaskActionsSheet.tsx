"use client";

import type { Item } from "@/data/inventory-mock";
import { CategoryIcon } from "@/components/CategoryIcon";
import { toISODate } from "@/components/planner/planner-view-utils";
import type { PlannedTask } from "@/lib/db/map-rows";

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function TaskActionsSheet({
  open,
  task,
  item,
  onClose,
  onMarkDone,
  onSkip,
  onReschedule,
  onDelete,
  onOpenPlannerEdit,
}: {
  open: boolean;
  task: PlannedTask | null;
  item: Item | null;
  onClose: () => void;
  onMarkDone: (taskId: string) => void;
  onSkip: (taskId: string) => void;
  onReschedule: (taskId: string, toISODate: string) => void;
  onDelete: (taskId: string) => void;
  onOpenPlannerEdit: () => void;
}) {
  if (!open || !task || !item) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
        aria-label="Close task actions"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Task actions"
        className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-shell rounded-t-[20px] border border-border bg-surface-raised shadow-[0_-12px_40px_rgba(15,57,76,0.12)] sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
      >
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-8 md:px-10">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-ink-faint/50" aria-hidden />

          <header className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <CategoryIcon category={item.category} />
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-ink">{task.title_snapshot}</div>
                  <div className="mt-1 text-[13px] text-ink-muted">
                    {item.category} · {item.estimated_minutes} min
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-muted/70 hover:text-ink"
            >
              Close
            </button>
          </header>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => onMarkDone(task.id)}
              className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-[13px] font-semibold text-ink shadow-soft hover:border-teal/30"
            >
              Mark done
            </button>
            <button
              type="button"
              onClick={() => onSkip(task.id)}
              className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-[13px] font-semibold text-ink shadow-soft hover:border-accent/20"
            >
              Skip
            </button>

            <button
              type="button"
              onClick={() => {
                if (
                  typeof window !== "undefined" &&
                  !window.confirm("Remove this task from your planner? The inventory item is not deleted.")
                ) {
                  return;
                }
                onDelete(task.id);
              }}
              className="w-full rounded-[10px] border border-red-800/25 bg-surface-raised px-4 py-3 text-[13px] font-semibold text-red-900/90 shadow-soft hover:border-red-800/40 hover:bg-red-50/50"
            >
              Remove from planner
            </button>

            <div className="pt-1">
              <div className="mb-2 text-[13px] font-medium text-ink-muted">Reschedule</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onReschedule(task.id, toISODate(addDays(new Date(task.scheduled_date), 1)))
                  }
                  className="rounded-[10px] border border-border bg-surface-alt px-3 py-2 text-[13px] font-medium text-ink-muted"
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onReschedule(task.id, toISODate(addDays(new Date(task.scheduled_date), 2)))
                  }
                  className="rounded-[10px] border border-border bg-surface-alt px-3 py-2 text-[13px] font-medium text-ink-muted"
                >
                  Next open day
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onReschedule(task.id, toISODate(addDays(new Date(task.scheduled_date), 3)))
                  }
                  className="rounded-[10px] border border-border bg-surface-alt px-3 py-2 text-[13px] font-medium text-ink-muted"
                >
                  Later this week
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onReschedule(task.id, toISODate(addDays(new Date(task.scheduled_date), 7)))
                  }
                  className="rounded-[10px] border border-border bg-surface-alt px-3 py-2 text-[13px] font-medium text-ink-muted"
                >
                  Next week
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onReschedule(task.id, toISODate(addDays(new Date(task.scheduled_date), 4)))
                  }
                  className="col-span-2 rounded-[10px] border border-border bg-surface-alt px-3 py-2 text-[13px] font-medium text-ink-muted"
                >
                  Custom
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenPlannerEdit()}
              className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-[13px] font-semibold text-ink shadow-soft hover:border-accent/25"
            >
              Edit
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
