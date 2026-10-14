"use client";

/** Undo notes stay up long enough to tap, then get out of the way. */
export const TOAST_DISMISS_MS = 4000;

export function ToastView({
  message,
  onUndo,
  onDismiss,
}: {
  message: string;
  onUndo?: () => void | Promise<void>;
  onDismiss: () => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[90] flex justify-center px-3 pt-[max(0.35rem,env(safe-area-inset-top))]"
      role="status"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-1 rounded-full border border-[#e5dad0] bg-[#f6f4f0] py-0.5 pl-3 pr-1 text-[13px] text-[#0f394c] shadow-soft">
        <p className="min-w-0 flex-1 truncate">{message}</p>
        {onUndo ? (
          <button
            type="button"
            onClick={() => void onUndo()}
            className="min-h-11 shrink-0 px-2 text-[13px] font-semibold text-[#0f394c]"
          >
            Undo
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="min-h-11 min-w-11 shrink-0 text-[18px] leading-none text-[#0f394c]"
        >
          ×
        </button>
      </div>
    </div>
  );
}
