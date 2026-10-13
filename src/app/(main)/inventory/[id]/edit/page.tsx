"use client";

import { createClient } from "@lib/supabase";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { ItemForm } from "@/components/inventory/ItemForm";
import { ToastView } from "@/components/planner/ToastView";
import { toISODate } from "@/components/planner/planner-view-utils";
import type { Item } from "@/data/inventory-mock";
import { itemToInsertRow, itemToUpdateRow, mapItemRow, mapPlannedTaskRow, plannedTaskToInsertRow, type PlannedTask } from "@/lib/db/map-rows";
import { syncFutureTasks } from "@/lib/inventory/future-tasks";

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
  const [confirmMode, setConfirmMode] = useState<"delete" | "clear" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void | Promise<void> } | null>(null);
  const [removed, setRemoved] = useState(false);

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

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.onUndo ? 12000 : 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function handleSave(updated: Item) {
    setSaving(true);
    setSaveError(null);
    const nowISO = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("items")
      .update(itemToUpdateRow(updated, nowISO))
      .eq("id", updated.id)
      .select()
      .single();

    setSaving(false);

    if (updateError) {
      setSaveError(updateError.message);
      return;
    }
    const synced = await syncFutureTasks(supabase, { ...updated, updated_at: nowISO }, toISODate(new Date()));
    if (synced.error) {
      setSaveError(synced.error);
      return;
    }
    router.push("/inventory");
    router.refresh();
  }

  async function handleArchive() {
    if (!item) return;
    const nextArchived = !item.is_archived;
    const nowISO = new Date().toISOString();
    const { error } = await supabase
      .from("items")
      .update({ is_archived: nextArchived, updated_at: nowISO })
      .eq("id", item.id);
    if (error) {
      setSaveError(error.message);
      return;
    }
    const previous = item;
    setItem({ ...item, is_archived: nextArchived, updated_at: nowISO });
    setToast({
      message: nextArchived ? "Archived. It stays out of the main list." : "Back in the main list.",
      onUndo: async () => {
        const undoAt = new Date().toISOString();
        const { error: undoError } = await supabase
          .from("items")
          .update({ is_archived: previous.is_archived, updated_at: undoAt })
          .eq("id", previous.id);
        if (undoError) {
          setSaveError(undoError.message);
          return;
        }
        setItem(previous);
        setToast({ message: "Reverted." });
      },
    });
  }

  async function handleClearUpcoming() {
    if (!item) return;
    setDeleting(true);
    setSaveError(null);
    try {
      const { data, error } = await supabase.from("planned_tasks").select("*").eq("item_id", item.id);
      if (error) {
        setSaveError(error.message);
        return;
      }
      const today = toISODate(new Date());
      const upcoming = (data ?? [])
        .map((row) => mapPlannedTaskRow(row as Parameters<typeof mapPlannedTaskRow>[0]))
        .filter((task) => task.scheduled_date >= today && task.status !== "done" && task.status !== "skipped");
      if (upcoming.length === 0) {
        setToast({ message: "No upcoming tasks to clear." });
        setConfirmMode(null);
        return;
      }
      const { error: deleteError } = await supabase
        .from("planned_tasks")
        .delete()
        .in(
          "id",
          upcoming.map((task) => task.id),
        );
      if (deleteError) {
        setSaveError(deleteError.message);
        return;
      }
      setConfirmMode(null);
      setToast({
        message: `Cleared ${upcoming.length} upcoming task${upcoming.length === 1 ? "" : "s"}.`,
        onUndo: () => restoreTasks(upcoming),
      });
    } finally {
      setDeleting(false);
    }
  }

  async function restoreTasks(tasks: PlannedTask[]) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("planned_tasks").insert(tasks.map((task) => plannedTaskToInsertRow(user.id, task)));
    if (error) {
      setSaveError(error.message);
      return;
    }
    setToast({ message: "Restored those tasks." });
  }

  async function handleDelete() {
    if (!item) return;
    setDeleting(true);
    setSaveError(null);
    const snapshot = item;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSaveError("Sign in to delete an item.");
        return;
      }
      const { data: taskRows, error: taskError } = await supabase
        .from("planned_tasks")
        .select("*")
        .eq("item_id", item.id);
      if (taskError) {
        setSaveError(taskError.message);
        return;
      }
      const tasks = (taskRows ?? []).map((row) => mapPlannedTaskRow(row as Parameters<typeof mapPlannedTaskRow>[0]));
      const { error: deleteErr } = await supabase.from("items").delete().eq("id", item.id);
      if (deleteErr) {
        setSaveError(deleteErr.message);
        return;
      }
      setConfirmMode(null);
      setRemoved(true);
      setToast({
        message: "Deleted. You can undo this.",
        onUndo: async () => {
          const { data: restored, error: restoreError } = await supabase
            .from("items")
            .insert(itemToInsertRow(user.id, snapshot))
            .select()
            .single();
          if (restoreError || !restored) {
            setSaveError(restoreError?.message ?? "Could not undo.");
            return;
          }
          const restoredItem = mapItemRow(restored as Parameters<typeof mapItemRow>[0]);
          if (tasks.length > 0) {
            const { error: tasksError } = await supabase
              .from("planned_tasks")
              .insert(tasks.map((task) => plannedTaskToInsertRow(user.id, { ...task, item_id: restoredItem.id })));
            if (tasksError) {
              setSaveError(tasksError.message);
              return;
            }
          }
          setItem(restoredItem);
          setRemoved(false);
          setToast({ message: "Restored." });
          router.replace(`/inventory/${restoredItem.id}/edit`);
        },
      });
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col">
        <p className="text-[13px] text-ink-muted">Loading…</p>
      </div>
    );
  }

  if (removed) {
    return (
      <div className="flex flex-1 flex-col">
        <p className="text-[13px] text-ink-muted">That item is deleted.</p>
        {toast ? <ToastView message={toast.message} onUndo={toast.onUndo} /> : null}
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
          disabled={saving || deleting}
          autoFocusTitle={false}
          onSubmit={(updated) => void handleSave(updated)}
        />
        <div className="flex flex-col gap-2 pt-3">
          <button
            type="button"
            onClick={() => void handleArchive()}
            disabled={saving || deleting}
            className="min-h-11 w-full rounded-[10px] border border-border bg-surface-alt px-4 py-3 text-[13px] font-semibold text-ink disabled:opacity-60"
          >
            {item.is_archived ? "Unarchive" : "Archive"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmMode("clear")}
            disabled={saving || deleting}
            className="min-h-11 w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-[13px] font-semibold text-ink disabled:opacity-60"
          >
            Clear upcoming tasks
          </button>
          <button
            type="button"
            onClick={() => setConfirmMode("delete")}
            disabled={saving || deleting}
            className="min-h-11 w-full rounded-[10px] border border-red-800/25 bg-surface-raised px-4 py-3 text-[13px] font-semibold text-red-900/90 disabled:opacity-60"
          >
            Delete item
          </button>
        </div>
      </div>

      {saveError ? (
        <p className="mt-4 text-[13px] text-red-700/90" role="alert">
          {saveError}
        </p>
      ) : null}
      <ConfirmSheet
        open={confirmMode != null}
        title={confirmMode === "delete" ? `Delete ${item.title}?` : `Clear upcoming tasks for ${item.title}?`}
        body={
          confirmMode === "delete"
            ? "This removes the item and its calendar entries. You can undo from the toast."
            : "Past and finished tasks stay. Upcoming ones leave the calendar. You can undo from the toast."
        }
        confirmLabel={deleting ? "Working…" : confirmMode === "delete" ? "Delete item" : "Clear upcoming tasks"}
        busy={deleting}
        onConfirm={() => void (confirmMode === "delete" ? handleDelete() : handleClearUpcoming())}
        onCancel={() => setConfirmMode(null)}
      />
      {toast ? <ToastView message={toast.message} onUndo={toast.onUndo} /> : null}
    </div>
  );
}
