"use client";

/**
 * Sits fully above the bottom nav.
 * The nav is 7rem tall once its 0.75rem padding is counted, and grows with the
 * home-indicator inset. This leaves a 0.75rem gap above that bar.
 */
export const FLOATING_ADD_BOTTOM_CLASS =
  "bottom-[calc(7rem+max(0px,env(safe-area-inset-bottom,0px)-0.75rem))]";

/** Extra list padding so the last row can scroll above the nav and this button. */
export const LIST_CLEARANCE_ABOVE_ADD_CLASS =
  "pb-[calc(4.75rem+max(0px,env(safe-area-inset-bottom,0px)-0.75rem))]";

export function FloatingAddButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-floating-add="true"
      aria-label={label}
      className={`fixed right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-surface-raised shadow-[0_4px_14px_rgba(202,165,16,0.35)] transition-transform hover:scale-[1.02] active:scale-[0.98] sm:right-8 ${FLOATING_ADD_BOTTOM_CLASS}`}
    >
      <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
    </button>
  );
}
