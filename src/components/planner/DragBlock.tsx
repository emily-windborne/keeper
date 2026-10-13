"use client";

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  dayOffsetFromDelta,
  resizeBlock,
  shiftBlock,
  SNAP_MINUTES,
  TIMELINE_END_MIN,
  TIMELINE_START_MIN,
} from "@/lib/planner/time-snap";

let suppressBackgroundClick = false;

export function consumeBackgroundClick(): boolean {
  if (!suppressBackgroundClick) return false;
  suppressBackgroundClick = false;
  return true;
}

type Preview = {
  startMin: number;
  endMin: number;
  dayOffset: number;
  top: number;
  left: number;
  width: number;
  height: number;
};

export function DragBlock({
  enabled,
  canResize,
  startMin,
  endMin,
  hourPx,
  weekDates,
  dateISO,
  className,
  style,
  ariaLabel,
  onOpen,
  onCommit,
  children,
}: {
  enabled: boolean;
  canResize: boolean;
  startMin: number;
  endMin: number;
  hourPx: number;
  weekDates?: string[];
  dateISO: string;
  className?: string;
  style?: CSSProperties;
  ariaLabel: string;
  onOpen: () => void;
  onCommit: (next: { dateISO: string; startMin: number; endMin: number }) => void;
  children: ReactNode;
}) {
  const origin = useRef<{
    pointerId: number;
    mode: "move" | "resize";
    x: number;
    y: number;
    startMin: number;
    endMin: number;
    top: number;
    left: number;
    width: number;
    columnWidth: number;
    moved: boolean;
  } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewRef = useRef<Preview | null>(null);

  function begin(event: ReactPointerEvent<HTMLElement>, mode: "move" | "resize") {
    if (!enabled) return;
    event.stopPropagation();
    const block = event.currentTarget.closest("[data-task]") ?? event.currentTarget;
    block.setPointerCapture(event.pointerId);
    const rect = block.getBoundingClientRect();
    const column = block.closest("[data-day-column]");
    origin.current = {
      pointerId: event.pointerId,
      mode,
      x: event.clientX,
      y: event.clientY,
      startMin,
      endMin,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      columnWidth: column?.getBoundingClientRect().width ?? 0,
      moved: false,
    };
  }

  function update(event: ReactPointerEvent<HTMLElement>) {
    const current = origin.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.moved && Math.hypot(dx, dy) < 8) return;
    current.moved = true;
    const deltaMinutes = Math.round(((dy / hourPx) * 60) / SNAP_MINUTES) * SNAP_MINUTES;
    const next =
      current.mode === "resize"
        ? resizeBlock({
            startMin: current.startMin,
            endMin: current.endMin,
            deltaMinutes,
            maxEnd: TIMELINE_END_MIN,
          })
        : shiftBlock({
            startMin: current.startMin,
            endMin: current.endMin,
            deltaMinutes,
            minStart: TIMELINE_START_MIN,
            maxEnd: TIMELINE_END_MIN,
          });
    const dayOffset =
      current.mode === "move" ? dayOffsetFromDelta(dx, current.columnWidth) : 0;
    const pxPerMin = hourPx / 60;
    const nextPreview: Preview = {
      startMin: next.startMin,
      endMin: next.endMin,
      dayOffset,
      top: current.top + (next.startMin - current.startMin) * pxPerMin,
      left: current.left + dayOffset * current.columnWidth,
      width: current.width,
      height: Math.max(44, (next.endMin - next.startMin) * pxPerMin),
    };
    previewRef.current = nextPreview;
    setPreview(nextPreview);
  }

  function finish(event: ReactPointerEvent<HTMLElement>) {
    const current = origin.current;
    if (!current || event.pointerId !== current.pointerId) return;
    origin.current = null;
    const next = previewRef.current;
    previewRef.current = null;
    setPreview(null);
    if (!current.moved || !next) {
      onOpen();
      return;
    }
    suppressBackgroundClick = true;
    const dates = weekDates ?? [dateISO];
    const index = Math.max(0, dates.indexOf(dateISO));
    const nextIndex = Math.min(dates.length - 1, Math.max(0, index + next.dayOffset));
    onCommit({
      dateISO: dates[nextIndex] ?? dateISO,
      startMin: next.startMin,
      endMin: next.endMin,
    });
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        data-task="true"
        aria-label={ariaLabel}
        className={className}
        style={{ ...style, touchAction: "none", opacity: preview ? 0.35 : style?.opacity }}
        onPointerDown={(event) => begin(event, "move")}
        onPointerMove={update}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClick={() => {
          if (!enabled) onOpen();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
      >
        {children}
        {enabled && canResize ? (
          <span
            role="presentation"
            className="absolute inset-x-0 bottom-0 z-10 flex h-6 items-end justify-center"
            onPointerDown={(event) => begin(event, "resize")}
            onPointerMove={update}
            onPointerUp={finish}
            onPointerCancel={finish}
          >
            <span className="mb-1 h-1.5 w-8 rounded-full bg-[#caa510]" />
          </span>
        ) : null}
      </div>
      {preview ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[80] overflow-hidden rounded-[14px] border border-[#caa510] bg-[#f6f4f0]/95 px-1 py-1 shadow-soft"
          style={{
            top: preview.top,
            left: preview.left,
            width: preview.width,
            height: preview.height,
          }}
        >
          {children}
        </div>
      ) : null}
    </>
  );
}
