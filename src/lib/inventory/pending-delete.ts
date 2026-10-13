import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";

const STORAGE_KEY = "keeper.pending-item-delete";

export type PendingItemDelete = {
  item: Item;
  tasks: PlannedTask[];
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function parsePendingItemDelete(raw: string | null): PendingItemDelete | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingItemDelete>;
    if (!parsed.item || typeof parsed.item !== "object") return null;
    if (typeof parsed.item.id !== "string" || typeof parsed.item.title !== "string") return null;
    return {
      item: parsed.item,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch {
    return null;
  }
}

/** A missing item should leave the edit page. A failed load should stay and show the error. */
export function routeAfterItemLoad(input: {
  found: boolean;
  fetchError: string | null;
}): "inventory" | "stay" {
  if (input.fetchError) return "stay";
  if (!input.found) return "inventory";
  return "stay";
}

export function savePendingItemDelete(pending: PendingItemDelete, storage: StorageLike = sessionStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(pending));
}

export function readPendingItemDelete(storage: StorageLike = sessionStorage): PendingItemDelete | null {
  return parsePendingItemDelete(storage.getItem(STORAGE_KEY));
}

export function clearPendingItemDelete(storage: StorageLike = sessionStorage): void {
  storage.removeItem(STORAGE_KEY);
}
