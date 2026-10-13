import { Suspense } from "react";
import { PlannerScreen } from "@/components/planner/PlannerScreen";

export default function PlannerPage() {
  return (
    <Suspense fallback={<p className="text-[13px] text-ink-muted">Loading…</p>}>
      <PlannerScreen />
    </Suspense>
  );
}
