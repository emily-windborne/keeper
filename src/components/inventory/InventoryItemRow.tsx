"use client";

import { useRef, useState } from "react";
import { CategoryIcon } from "@/components/CategoryIcon";
import type { Item } from "@/data/inventory-mock";

export function InventoryItemRow({
  item,
  detail,
  onOpen,
  onAskDelete,
}: {
  item: Item;
  detail: string;
  onOpen: () => void;
  onAskDelete: () => void;
}) {
  const [drag, setDrag] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<number | null>(null);
  const longFired = useRef(false);

  function clearTimer() {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  return (
    <div className="relative overflow-hidden rounded-[14px]">
      <button
        type="button"
        onClick={onAskDelete}
        className="absolute inset-y-0 right-0 flex w-[88px] items-center justify-center bg-red-900/90 text-[13px] font-semibold text-white"
      >
        Delete
      </button>
      <button
        type="button"
        onClick={() => {
          if (longFired.current || drag < -24) {
            longFired.current = false;
            return;
          }
          onOpen();
        }}
        onPointerDown={(event) => {
          start.current = { x: event.clientX, y: event.clientY };
          longFired.current = false;
          clearTimer();
          timer.current = window.setTimeout(() => {
            longFired.current = true;
            setDrag(0);
            onAskDelete();
          }, 550);
        }}
        onPointerMove={(event) => {
          if (!start.current) return;
          const dx = event.clientX - start.current.x;
          const dy = event.clientY - start.current.y;
          if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimer();
          if (dx < 0 && Math.abs(dx) > Math.abs(dy)) setDrag(Math.max(dx, -88));
        }}
        onPointerUp={() => {
          clearTimer();
          start.current = null;
          setDrag((current) => (current < -56 ? -88 : 0));
        }}
        onPointerCancel={() => {
          clearTimer();
          start.current = null;
          setDrag(0);
        }}
        style={{ transform: `translateX(${drag}px)` }}
        className="relative flex min-h-[52px] w-full touch-manipulation flex-col items-stretch rounded-[14px] border border-border bg-surface-raised p-4 text-left text-inherit shadow-soft"
        aria-label={`Edit ${item.title}`}
      >
        <span className="flex items-start gap-2">
          <CategoryIcon category={item.category} />
          <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-ink">{item.title}</span>
        </span>
        <span className="mt-1 block text-[13px] text-ink-muted">{detail}</span>
      </button>
    </div>
  );
}
