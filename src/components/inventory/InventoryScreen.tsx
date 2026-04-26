"use client";

import { createClient } from "@lib/supabase";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { AddItemSheet } from "@/components/inventory/AddItemSheet";
import {
  type Item,
  type ItemCategory,
  type ItemPriority,
} from "@/data/inventory-mock";
import { itemToInsertRow, mapItemRow } from "@/lib/db/map-rows";

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
  const { frequency_type, frequency_value } = item;
  if (!frequency_type) return "Custom";
  if (frequency_type === "custom") return "Custom";
  if (frequency_type === "daily") return "Daily";
  if (frequency_type === "weekly")
    return frequency_value && frequency_value !== 1 ? `${frequency_value}x/week` : "Weekly";
  if (frequency_type === "biweekly")
    return frequency_value && frequency_value !== 1 ? `${frequency_value}x/biweekly` : "Biweekly";
  if (frequency_type === "monthly")
    return frequency_value && frequency_value !== 1 ? `${frequency_value}x/month` : "Monthly";
  return "Custom";
}

export function InventoryScreen() {
  const supabase = useMemo(() => createClient(), []);
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

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
        itemToInsertRow(user.id, {
          title: item.title,
          category: item.category,
          type: item.type,
          frequency_type: item.frequency_type,
          frequency_value: item.frequency_value,
          preferred_days: item.preferred_days,
          preferred_time_of_day: item.preferred_time_of_day,
          estimated_minutes: item.estimated_minutes,
          priority: item.priority,
          flexibility: item.flexibility,
          cadence_pressure: item.cadence_pressure,
          minimum_success_threshold: item.minimum_success_threshold,
          notes: item.notes,
          is_archived: item.is_archived,
          last_completed_at: item.last_completed_at,
          next_due_date: item.next_due_date,
        }),
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
              <Link
                href={`/inventory/${item.id}/edit`}
                className="flex w-full min-h-[52px] min-w-0 touch-manipulation flex-col items-stretch rounded-[14px] border border-border bg-surface-raised p-4 text-left text-inherit no-underline shadow-soft transition-colors [-webkit-tap-highlight-color:transparent] hover:border-accent/20 active:bg-surface-alt/40 focus-visible:border-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 sm:min-h-0"
                aria-label={`Edit ${item.title}`}
              >
                <span className="pointer-events-none flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-start gap-2">
                      <CategoryIcon category={item.category} />
                      <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-ink">
                        {item.title}
                      </span>
                    </span>
                    <span className="mt-1 block text-[13px] text-ink-muted">
                      <span className="font-medium text-ink-muted/90">{item.category}</span>
                      <span className="mx-1.5 text-ink-faint" aria-hidden>
                        ·
                      </span>
                      <span>{formatCadence(item)}</span>
                      <span className="mx-1.5 text-ink-faint" aria-hidden>
                        ·
                      </span>
                      <span>{item.estimated_minutes} min</span>
                    </span>
                  </span>
                  <PriorityPill priority={item.priority} />
                </span>
              </Link>
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
    </div>
  );
}

function PriorityPill({ priority }: { priority: ItemPriority }) {
  const styles: Record<ItemPriority, string> = {
    Critical: "bg-accent-soft text-accent border-accent/15",
    Important: "bg-accent-soft text-accent border-accent/15",
    Standard: "bg-surface-alt text-ink-muted border-border",
    Optional: "bg-surface-alt text-ink-muted border-border",
  };

  return (
    <span
      className={`inline-flex shrink-0 self-start rounded-full border px-3 py-1 text-[12px] font-medium sm:self-center ${styles[priority]}`}
    >
      {priority}
    </span>
  );
}
