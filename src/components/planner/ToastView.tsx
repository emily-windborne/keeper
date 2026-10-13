"use client";

export function ToastView({
  message,
  onUndo,
}: {
  message: string;
  onUndo?: () => void | Promise<void>;
}) {
  return (
    <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+1.25rem)] left-1/2 z-[90] w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
      <div className="flex flex-col items-stretch gap-2 rounded-[20px] border border-border bg-surface-raised px-4 py-3 text-[13px] text-ink-muted shadow-soft sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-center sm:flex-1 sm:text-left">{message}</p>
        {onUndo && (
          <button
            type="button"
            onClick={() => void onUndo()}
            className="min-h-11 shrink-0 rounded-full border border-border bg-surface-alt px-3 py-1.5 text-[13px] font-medium text-ink hover:border-accent/25"
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
