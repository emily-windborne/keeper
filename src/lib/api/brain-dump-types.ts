import type { Item } from "@/data/inventory-mock";

/** Payload for inserting items (matches `itemToInsertRow` second argument). */
export type BrainDumpItemDraft = Omit<Item, "id" | "created_at" | "updated_at">;

export type ParseBrainDumpRequestBody = {
  text: string;
};

export type ParseBrainDumpResponseBody = {
  items: BrainDumpItemDraft[];
};
