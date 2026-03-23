"use client";

import { createClient } from "@lib/supabase";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ItemForm } from "@/components/inventory/ItemForm";
import type { Item } from "@/data/inventory-mock";
import { mapItemRow } from "@/lib/db/map-rows";

export default function EditInventoryItemPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

  const supabase = useMemo(() => createClient(), []);
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadItem = useCallback(async () => {
    if (!id) {
      setFetchError("Invalid item.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(null);
    const { data, error: err } = await supabase.from("items").select("*").eq("id", id).maybeSingle();
    if (err) {
      setFetchError(err.message);
      setItem(null);
      setLoading(false);
      return;
    }
    if (!data) {
      setFetchError("This item could not be found.");
      setItem(null);
      setLoading(false);
      return;
    }
    setItem(mapItemRow(data as Parameters<typeof mapItemRow>[0]));
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    void loadItem();
  }, [loadItem]);

  async function handleSave(updated: Item) {
    setSaving(true);
    setSaveError(null);
    const nowISO = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("items")
      .update({
        title: updated.title,
        category: updated.category,
        type: updated.type,
        frequency_type: updated.frequency_type,
        frequency_value: updated.frequency_value,
        preferred_days: updated.preferred_days,
        preferred_time_of_day: updated.preferred_time_of_day,
        estimated_minutes: updated.estimated_minutes,
        priority: updated.priority,
        flexibility: updated.flexibility,
        cadence_pressure: updated.cadence_pressure,
        minimum_success_threshold: updated.minimum_success_threshold,
        notes: updated.notes,
        is_archived: updated.is_archived,
        last_completed_at: updated.last_completed_at,
        next_due_date: updated.next_due_date,
        updated_at: nowISO,
      })
      .eq("id", updated.id)
      .select()
      .single();

    setSaving(false);

    if (updateError) {
      setSaveError(updateError.message);
      return;
    }
    router.push("/inventory");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col">
        <p className="text-[13px] text-ink-muted">Loading…</p>
      </div>
    );
  }

  if (fetchError || !item) {
    return (
      <div className="flex flex-1 flex-col">
        <Link
          href="/inventory"
          className="mb-6 inline-flex items-center gap-1 text-[13px] font-medium text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
          Back to inventory
        </Link>
        <p className="rounded-[14px] border border-dashed border-border bg-surface-alt/60 px-4 py-8 text-center text-[13px] text-ink-muted">
          {fetchError ?? "Item not found."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col pb-4">
      <Link
        href="/inventory"
        className="mb-5 inline-flex items-center gap-1 text-[13px] font-medium text-ink-muted transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
        Back to inventory
      </Link>

      <header className="mb-6 sm:mb-8">
        <h1 className="font-serif text-[26px] font-normal leading-tight tracking-tight text-ink sm:text-[26px]">
          Edit item
        </h1>
        <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-ink-muted">
          Update details for this obligation. Changes save to your inventory.
        </p>
      </header>

      <div className="rounded-[14px] border border-border bg-surface-raised p-4 shadow-soft sm:p-6">
        <ItemForm
          key={item.id}
          initialItem={item}
          submitLabel={saving ? "Saving…" : "Save changes"}
          disabled={saving}
          autoFocusTitle={false}
          onSubmit={(updated) => void handleSave(updated)}
        />
      </div>

      {saveError ? (
        <p className="mt-4 text-[13px] text-red-700/90" role="alert">
          {saveError}
        </p>
      ) : null}
    </div>
  );
}
