"use client";

import { createPortal } from "react-dom";
import { useEffect } from "react";
import { CloseButton } from "@/components/CloseButton";
import type { Item } from "@/data/inventory-mock";
import { ItemForm } from "@/components/inventory/ItemForm";

type AddItemSheetProps = {
  open: boolean;
  onClose: () => void;
  onSave: (item: Item) => void | Promise<void>;
};

export function AddItemSheet({ open, onClose, onSave }: AddItemSheetProps) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  function handleCancel() {
    onClose();
  }

  if (!open) return null;

  const modal = (
    <div className="fixed inset-0 z-[200]">
      <button
        type="button"
        className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
        aria-label="Close add item"
        onClick={handleCancel}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Add Item"
        className="absolute bottom-0 left-0 right-0 mx-auto max-h-[min(88dvh,720px)] w-full max-w-shell overflow-y-auto rounded-t-[20px] border border-border bg-surface-raised shadow-[0_-12px_40px_rgba(15,57,76,0.12)] sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
      >
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-8 md:px-10">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-ink-faint/50" aria-hidden />

          <header className="mb-4 flex items-start justify-between gap-2">
            <h2 className="font-serif text-[22px] font-normal tracking-tight text-ink">Add item</h2>
            <CloseButton onClick={handleCancel} />
          </header>

          <ItemForm
            initialItem={null}
            submitLabel="Save"
            onSubmit={async (item) => {
              try {
                await onSave(item);
                onClose();
              } catch {
                // Keep sheet open so the user can fix errors or retry.
              }
            }}
          />
        </div>
      </section>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
