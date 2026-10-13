import assert from "node:assert/strict";
import test from "node:test";
import type { Item } from "@/data/inventory-mock";
import {
  clearPendingItemDelete,
  parsePendingItemDelete,
  readPendingItemDelete,
  routeAfterItemLoad,
  savePendingItemDelete,
} from "@/lib/inventory/pending-delete";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

const item = {
  id: "item-1",
  title: "Water plants",
} as Item;

test("a deleted item can be handed to the list and then cleared", () => {
  const storage = memoryStorage();
  savePendingItemDelete({ item, tasks: [] }, storage);
  assert.equal(readPendingItemDelete(storage)?.item.title, "Water plants");
  clearPendingItemDelete(storage);
  assert.equal(readPendingItemDelete(storage), null);
});

test("junk in storage does not become an undo", () => {
  assert.equal(parsePendingItemDelete("not-json"), null);
  assert.equal(parsePendingItemDelete(JSON.stringify({ item: { id: 1 } })), null);
});

test("a missing item leaves the edit page, and a load error stays", () => {
  assert.equal(routeAfterItemLoad({ found: false, fetchError: null }), "inventory");
  assert.equal(routeAfterItemLoad({ found: false, fetchError: "network" }), "stay");
  assert.equal(routeAfterItemLoad({ found: true, fetchError: null }), "stay");
});
