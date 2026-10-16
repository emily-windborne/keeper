import type { SupabaseClient } from "@supabase/supabase-js";
import type { Item } from "@/data/inventory-mock";

const DAY_MS = 24 * 60 * 60 * 1000;
export const ONE_OFF_ARCHIVE_DAYS = 30;

export type OneOffArchivePlan = {
  archiveIds: string[];
  deleteIds: string[];
};

function dueDay(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

/**
 * Past or finished one-offs move to the archive.
 * Archived one-offs are deleted 30 days after they were archived.
 */
export function planOneOffArchive(items: Item[], todayISO: string, now: Date): OneOffArchivePlan {
  const cutoff = now.getTime() - ONE_OFF_ARCHIVE_DAYS * DAY_MS;
  const archiveIds: string[] = [];
  const deleteIds: string[] = [];
  for (const item of items) {
    if (item.type !== "one_off") continue;
    const due = dueDay(item.next_due_date);
    const past = due != null && due < todayISO;
    const done = item.last_completed_at != null;
    if (!item.is_archived && !past && !done) continue;
    const stamp = item.archived_at ?? (item.is_archived ? item.updated_at : null);
    const expired = stamp != null && Number.isFinite(Date.parse(stamp)) && Date.parse(stamp) <= cutoff;
    if (item.is_archived && expired) {
      deleteIds.push(item.id);
      continue;
    }
    if (!item.is_archived && (past || done)) archiveIds.push(item.id);
  }
  return { archiveIds, deleteIds };
}

export function applyArchivePlan(items: Item[], plan: OneOffArchivePlan, nowISO: string): Item[] {
  const drop = new Set(plan.deleteIds);
  const archive = new Set(plan.archiveIds);
  return items
    .filter((item) => !drop.has(item.id))
    .map((item) =>
      archive.has(item.id) ? { ...item, is_archived: true, archived_at: nowISO } : item,
    );
}

export async function settleOneOffArchive(
  supabase: SupabaseClient,
  items: Item[],
  todayISO: string,
  now: Date = new Date(),
): Promise<{ items: Item[]; error: string | null }> {
  const plan = planOneOffArchive(items, todayISO, now);
  if (plan.archiveIds.length === 0 && plan.deleteIds.length === 0) {
    return { items, error: null };
  }
  const nowISO = now.toISOString();
  let error: string | null = null;
  if (plan.archiveIds.length > 0) {
    const archived = await supabase
      .from("items")
      .update({ is_archived: true, archived_at: nowISO, updated_at: nowISO })
      .in("id", plan.archiveIds);
    if (archived.error && /archived_at|schema cache/i.test(archived.error.message)) {
      const retry = await supabase
        .from("items")
        .update({ is_archived: true, updated_at: nowISO })
        .in("id", plan.archiveIds);
      if (retry.error) {
        error =
          "One-off archive needs a database update. Run supabase/migrations/012_one_off_archive.sql in the Supabase SQL editor, then try again.";
      }
    } else if (archived.error) {
      error = archived.error.message;
    }
  }
  if (plan.deleteIds.length > 0) {
    const removed = await supabase.from("items").delete().in("id", plan.deleteIds);
    if (removed.error) error = removed.error.message;
  }
  if (error && plan.archiveIds.length === 0) return { items, error };
  return { items: applyArchivePlan(items, plan, nowISO), error };
}
