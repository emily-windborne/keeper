import { Suspense } from "react";
import { InventoryScreen } from "@/components/inventory/InventoryScreen";

export default function InventoryPage() {
  return (
    <Suspense fallback={<p className="text-[13px] text-ink-muted">Loading…</p>}>
      <InventoryScreen />
    </Suspense>
  );
}
