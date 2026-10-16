"use client";

import { createClient } from "@lib/supabase";
import { Archive, ChevronLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { FloatingAddButton, LIST_CLEARANCE_ABOVE_ADD_CLASS } from "@/components/FloatingAddButton";
import { AddItemSheet } from "@/components/inventory/AddItemSheet";
import { InventoryItemRow } from "@/components/inventory/InventoryItemRow";
import { TOAST_DISMISS_MS, ToastView } from "@/components/planner/ToastView";
import { type Item, type ItemCategory } from "@/data/inventory-mock";
import { itemToInsertRow, mapItemRow, mapPlannedTaskRow, plannedTaskToInsertRow, type PlannedTask } from "@/lib/db/map-rows";
import { formatDayAndRange } from "@/lib/planner/clock-label";
import { settleOneOffArchive } from "@/lib/inventory/one-off-archive";
import { clearPendingItemDelete, readPendingItemDelete, type PendingItemDelete } from "@/lib/inventory/pending-delete";

type FilterId = "all" | "archived" | "recurring" | "goal" | "anchor" | ItemCategory;

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "recurring", label: "Recurring" },
  { id: "goal", label: "Goals" },
  { id: "anchor", label: "Routine" },
  { id: "Home", label: "Home" },
  { id: "Family", label: "Family" },
  { id: "Personal", label: "Personal" },
  { id: "Work", label: "Work" },
  { id: "Upkeep", label: "Upkeep" },
  { id: "Health", label: "Health" },
];

function matchesFilter(item: Item, filter: FilterId): boolean {
  if (filter === "archived") {
    return item.is_archived;
  }
  if (item.is_archived) {
    return false;
  }
  if (item.type === "one_off") return false;
  if (filter === "all") return true;
  if (filter === "recurring") return item.type === "recurring";
  if (filter === "goal") return item.type === "goal";
  if (filter === "anchor") return item.type === "anchor";
  return item.category === filter;
}

function localTodayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function rowDetail(item: Item): string {
  if (item.type === "one_off") {
    const day = item.next_due_date?.slice(0, 10);
    if (day) return `${item.category} · ${formatDayAndRange(day, item.fixed_start_time, null)}`;
    return item.category;
  }
  return `${item.category} · ${formatCadence(item)} · ${item.estimated_minutes} min`;
}

function formatCadence(item: Item): string {
  const { frequency_type } = item;
  const times = item.times_per_period ?? 1;
  if (!frequency_type) return "Custom";
  if (frequency_type === "daily") return times > 1 ? `${times}x/day` : "Daily";
  if (frequency_type === "weekly") return times > 1 ? `${times}x/week` : "Weekly";
  if (frequency_type === "biweekly") return times > 1 ? `${times}x every 2 weeks` : "Biweekly";
  if (frequency_type === "monthly") return times > 1 ? `${times}x/month` : "Monthly";
  return times > 1 ? `${times}x` : "Custom";
}

export function InventoryScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justDeleted = searchParams.get("justDeleted") === "1";
  const supabase = useMemo(() => createClient(), []);
  const shownDeleteId = useRef<string | null>(null);
  const holdingPendingDelete = useRef(false);
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmItem, setConfirmItem] = useState<Item | null>(null);
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void | Promise<void> } | null>(null);

  const loadItems = useCallback(async () => {
    const { data: rows, error } = await supabase
      .from("items")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      setItems([]);
      return;
    }
    const mapped = (rows ?? []).map((r) => mapItemRow(r as Parameters<typeof mapItemRow>[0]));
    const settled = await settleOneOffArchive(supabase, mapped, localTodayISO());
    setItems(settled.items);
    if (settled.error) setToast({ message: settled.error });
  }, [supabase]);

  const undoPendingDelete = useCallback(
    async (pending: PendingItemDelete) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setToast({ message: "Sign in to undo that delete." });
        return;
      }
      const { data: restored, error: restoreError } = await supabase
        .from("items")
        .insert(itemToInsertRow(user.id, pending.item))
        .select()
        .single();
      if (restoreError || !restored) {
        setToast({ message: restoreError?.message ?? "Could not undo." });
        return;
      }
      const restoredItem = mapItemRow(restored as Parameters<typeof mapItemRow>[0]);
      const tasks = pending.tasks;
      if (tasks.length > 0) {
        const { error: tasksError } = await supabase
          .from("planned_tasks")
          .insert(tasks.map((task: PlannedTask) => plannedTaskToInsertRow(user.id, { ...task, item_id: restoredItem.id })));
        if (tasksError) {
          setToast({ message: tasksError.message });
          return;
        }
      }
      clearPendingItemDelete();
      holdingPendingDelete.current = false;
      setItems((prev) => [restoredItem, ...prev.filter((row) => row.id !== pending.item.id && row.id !== restoredItem.id)]);
      setToast({ message: "Restored." });
    },
    [supabase],
  );

  const showPendingDelete = useCallback(() => {
    const pending = readPendingItemDelete();
    if (!pending || shownDeleteId.current === pending.item.id) return;
    shownDeleteId.current = pending.item.id;
    holdingPendingDelete.current = true;
    setItems((prev) => prev.filter((row) => row.id !== pending.item.id));
    setToast({
      message: `Deleted ${pending.item.title}.`,
      onUndo: () => undoPendingDelete(pending),
    });
  }, [undoPendingDelete]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      await loadItems();
      if (cancelled) return;
      setLoading(false);
      showPendingDelete();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadItems, showPendingDelete]);

  useEffect(() => {
    if (!justDeleted) return;
    showPendingDelete();
    router.replace("/inventory");
  }, [justDeleted, router, showPendingDelete]);

  useEffect(() => {
    if (!toast) return;
    const shouldClearPending = holdingPendingDelete.current;
    const timer = window.setTimeout(() => {
      setToast(null);
      if (shouldClearPending) {
        holdingPendingDelete.current = false;
        clearPendingItemDelete();
      }
    }, TOAST_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const viewingArchive = activeFilter === "archived";
  const filtered = useMemo(
    () => items.filter((item) => matchesFilter(item, activeFilter)),
    [activeFilter, items],
  );

  async function handleAddItem(item: Item) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("You need to be signed in to add an item.");
    }

    const { data, error } = await supabase
      .from("items")
      .insert(
        itemToInsertRow(user.id, item),
      )
      .select()
      .single();

    if (error) {
      console.error(error);
      throw error;
    }
    setItems((prev) => [mapItemRow(data as Parameters<typeof mapItemRow>[0]), ...prev]);
  }

  function closeItemSheet() {
    setAddOpen(false);
  }

  async function deleteConfirmedItem() {
    const item = confirmItem;
    if (!item) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setToast({ message: "Sign in to delete an item." });
      return;
    }
    const { data: taskRows } = await supabase.from("planned_tasks").select("*").eq("item_id", item.id);
    const tasks = (taskRows ?? []).map((row) => mapPlannedTaskRow(row as Parameters<typeof mapPlannedTaskRow>[0]));
    const { error } = await supabase.from("items").delete().eq("id", item.id);
    if (error) {
      setToast({ message: error.message });
      return;
    }
    setItems((prev) => prev.filter((row) => row.id !== item.id));
    setConfirmItem(null);
    setToast({
      message: `Deleted ${item.title}.`,
      onUndo: async () => {
        const { data: restored, error: restoreError } = await supabase
          .from("items")
          .insert(itemToInsertRow(user.id, item))
          .select()
          .single();
        if (restoreError || !restored) {
          setToast({ message: restoreError?.message ?? "Could not undo." });
          return;
        }
        const restoredItem = mapItemRow(restored as Parameters<typeof mapItemRow>[0]);
        if (tasks.length > 0) {
          await supabase
            .from("planned_tasks")
            .insert(tasks.map((task) => plannedTaskToInsertRow(user.id, { ...task, item_id: restoredItem.id })));
        }
        setItems((prev) => [restoredItem, ...prev]);
        setToast({ message: "Restored." });
      },
    });
  }

  async function archiveConfirmedItem() {
    const item = confirmItem;
    if (!item) return;
    const nowISO = new Date().toISOString();
    const nextArchived = !item.is_archived;
    const stamp = nextArchived ? nowISO : null;
    let { error } = await supabase
      .from("items")
      .update({ is_archived: nextArchived, archived_at: stamp, updated_at: nowISO })
      .eq("id", item.id);
    if (error && /archived_at|schema cache/i.test(error.message)) {
      const retry = await supabase.from("items").update({ is_archived: nextArchived, updated_at: nowISO }).eq("id", item.id);
      error = retry.error;
    }
    if (error) {
      setToast({ message: error.message });
      return;
    }
    setItems((prev) =>
      prev.map((row) => (row.id === item.id ? { ...row, is_archived: nextArchived, archived_at: stamp } : row)),
    );
    setConfirmItem(null);
    setToast({
      message: item.is_archived ? "Back in the main list." : "Archived.",
      onUndo: async () => {
        await supabase.from("items").update({ is_archived: item.is_archived, updated_at: new Date().toISOString() }).eq("id", item.id);
        setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, is_archived: item.is_archived } : row)));
        setToast({ message: "Reverted." });
      },
    });
  }

  return (
    <div className={`relative flex flex-1 flex-col ${LIST_CLEARANCE_ABOVE_ADD_CLASS}`}>
      <header className="mb-6 sm:mb-8">
        <h1 className="font-serif text-[26px] font-normal leading-tight tracking-tight text-ink sm:text-[26px]">
          {viewingArchive ? "Archive" : "Inventory"}
        </h1>
        <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-ink-muted">
          {viewingArchive
            ? "Past one-offs and anything you put away. One-offs leave after 30 days."
            : "Routines, recurring items, and goals."}
        </p>
      </header>

      {viewingArchive ? (
        <button
          type="button"
          onClick={() => setActiveFilter("all")}
          className="mb-4 inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-ink-muted"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Inventory
        </button>
      ) : null}

      {viewingArchive ? null : (
      <div className="-mx-1 mb-6 sm:mb-8">
        <div
          className="flex flex-nowrap gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Filter items"
        >
          {FILTERS.map(({ id, label }) => {
            const active = activeFilter === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveFilter(id)}
                className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? "border-accent/25 bg-surface-alt text-accent shadow-sm"
                    : "border-border bg-surface-raised text-ink-muted shadow-sm hover:border-accent/20 hover:text-ink"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      )}

      {loading ? (
        <p className="text-[13px] text-ink-muted">Loading…</p>
      ) : (
        <ul className="relative z-10 m-0 list-none flex flex-col gap-3 p-0 sm:gap-4">
          {filtered.map((item) => (
            <li key={item.id}>
              <InventoryItemRow
                item={item}
                detail={rowDetail(item)}
                onOpen={() => router.push(`/inventory/${item.id}/edit`)}
                onAskDelete={() => setConfirmItem(item)}
              />
            </li>
          ))}
        </ul>
      )}

      {!loading && filtered.length === 0 && (
        <p className="mt-8 rounded-[14px] border border-dashed border-border bg-surface-alt/60 px-4 py-10 text-center text-[13px] text-ink-muted">
          {viewingArchive ? "Nothing in the archive." : "Nothing in this view yet. Try another filter."}
        </p>
      )}

      {!loading && !viewingArchive ? (
        <button
          type="button"
          onClick={() => setActiveFilter("archived")}
          className="mt-6 inline-flex min-h-11 items-center gap-1.5 self-start text-[13px] font-medium text-ink-muted"
        >
          <Archive className="h-4 w-4" aria-hidden />
          Archive
        </button>
      ) : null}

      <FloatingAddButton label="Add new item" onClick={() => setAddOpen(true)} />

      <AddItemSheet open={addOpen} onClose={closeItemSheet} onSave={(item) => void handleAddItem(item)} />
      <ConfirmSheet
        open={confirmItem != null}
        title={confirmItem ? confirmItem.title : "Item"}
        body="Swipe or a long press brought you here. Delete removes the item and its calendar entries. Archive hides it from the main list."
        confirmLabel="Delete item"
        secondaryLabel={confirmItem?.is_archived ? "Unarchive" : "Archive"}
        onConfirm={() => void deleteConfirmedItem()}
        onSecondary={() => void archiveConfirmedItem()}
        onCancel={() => setConfirmItem(null)}
      />
      {toast ? (
        <ToastView message={toast.message} onUndo={toast.onUndo} onDismiss={() => setToast(null)} />
      ) : null}
    </div>
  );
}
