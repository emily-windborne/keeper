"use client";

import { windowsOnDate, type ProtectedWindow } from "@/lib/planner/protected-time";

/** Soft labeled wash. Tasks sit on top and stay tappable. */
export function ProtectedBands({
  windows,
  dateISO,
  timelineStartMin,
  timelineEndMin,
  hourPx,
  topOffset = 0,
  labeled = true,
}: {
  windows: ProtectedWindow[];
  dateISO: string;
  timelineStartMin: number;
  timelineEndMin: number;
  hourPx: number;
  topOffset?: number;
  /** Narrow columns keep the wash and hide the name. */
  labeled?: boolean;
}) {
  return windowsOnDate(windows, dateISO).map((window) => {
    const start = Math.max(window.startMin, timelineStartMin);
    const end = Math.min(window.endMin, timelineEndMin);
    if (end <= start) return null;
    const top = topOffset + ((start - timelineStartMin) / 60) * hourPx;
    const height = ((end - start) / 60) * hourPx;
    return (
      <div
        key={window.id}
        className="pointer-events-none absolute inset-x-0 z-[2] overflow-hidden"
        style={{ top, height, backgroundColor: "rgba(245, 236, 196, 0.72)" }}
        aria-hidden
      >
        <span className={labeled ? "block truncate px-1 pt-0.5 text-[10px] font-medium leading-none text-[#0f394c]/55" : "sr-only"}>
          {window.name}
        </span>
      </div>
    );
  });
}
