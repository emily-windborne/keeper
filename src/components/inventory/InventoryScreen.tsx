"use client";

import { createClient } from "@lib/supabase";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { AddItemSheet } from "@/components/inventory/AddItemSheet";
import { InventoryItemRow } from "@/components/inventory/InventoryItemRow";
import { ToastView } from "@/components/planner/ToastView";
import { type Item, type ItemCategory } from "@/data/inventory-mock";
import { itemToInsertRow, mapItemRow, mapPlannedTaskRow, plannedTaskToInsertRow } from "@/lib/db/map-rows";

type FilterId = "all" | "archived" | "recurring" | "one_off" | "goal" | ItemCategory;

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "archived", label: "Archived" },
  { id: "recurring", label: "Recurring" },
  { id: "one_off", label: "One-off" },
  { id: "goal", label: "Goals" },
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
  if (filter === "all") return true;
  if (filter === "recurring") return item.type === "recurring";
  if (filter === "one_off") return item.type === "one_off";
  if (filter === "goal") return item.type === "goal";
  return item.category === filter;
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
  const supabase = useMemo(() => createClient(), []);
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
    setItems((rows ?? []).map((r) => mapItemRow(r as Parameters<typeof mapItemRow>[0])));
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      await loadItems();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadItems]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.onUndo ? 12000 : 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
    const { error } = await supabase
      .from("items")
      .update({ is_archived: !item.is_archived, updated_at: nowISO })
      .eq("id", item.id);
    if (error) {
      setToast({ message: error.message });
      return;
    }
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, is_archived: !item.is_archived } : row)));
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
    <div className="relative flex flex-1 flex-col pb-4">
      <header className="mb-6 sm:mb-8">
        <h1 className="font-serif text-[26px] font-normal leading-tight tracking-tight text-ink sm:text-[26px]">
          Inventory
        </h1>
        <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-ink-muted">
          Everything you track. Recurring items, one-offs, and goals in one calm list.
        </p>
      </header>

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
                className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-medium transition-colors ${
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

      {loading ? (
        <p className="text-[13px] text-ink-muted">Loading…</p>
      ) : (
        <ul className="relative z-10 m-0 list-none flex flex-col gap-3 p-0 sm:gap-4">
          {filtered.map((item) => (
            <li key={item.id}>
              <InventoryItemRow
                item={item}
                detail={`${item.category} · ${formatCadence(item)} · ${item.estimated_minutes} min`}
                onOpen={() => router.push(`/inventory/${item.id}/edit`)}
                onAskDelete={() => setConfirmItem(item)}
              />
            </li>
          ))}
        </ul>
      )}

      {!loading && filtered.length === 0 && (
        <p className="mt-8 rounded-[14px] border border-dashed border-border bg-surface-alt/60 px-4 py-10 text-center text-[13px] text-ink-muted">
          Nothing in this view yet. Try another filter.
        </p>
      )}

      <button
        type="button"
        className="fixed bottom-[max(5.5rem,calc(4.5rem+env(safe-area-inset-bottom)))] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-surface-raised shadow-[0_4px_14px_rgba(202,165,16,0.35)] transition-transform hover:scale-[1.02] active:scale-[0.98] sm:right-8"
        aria-label="Add new item"
        onClick={() => setAddOpen(true)}
      >
        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
      </button>

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
      {toast ? <ToastView message={toast.message} onUndo={toast.onUndo} /> : null}
    </div>
  );
}
