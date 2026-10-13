"use client";

export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  secondaryLabel,
  busy,
  onConfirm,
  onSecondary,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  secondaryLabel?: string;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onSecondary?: () => void | Promise<void>;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[85]">
      <button type="button" className="absolute inset-0 bg-black/20" aria-label="Close" onClick={onCancel} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-shell rounded-t-[20px] border border-border bg-surface-raised px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-12px_40px_rgba(15,57,76,0.12)] sm:max-w-xl"
      >
        <h2 className="font-serif text-[20px] font-normal text-ink">{title}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{body}</p>
        {children}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className="min-h-11 rounded-[10px] border border-red-800/25 bg-surface-raised px-4 py-3 text-[13px] font-semibold text-red-900/90 disabled:opacity-60"
          >
            {confirmLabel}
          </button>
          {secondaryLabel && onSecondary ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onSecondary()}
              className="min-h-11 rounded-[10px] border border-border bg-surface-alt px-4 py-3 text-[13px] font-semibold text-ink disabled:opacity-60"
            >
              {secondaryLabel}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-11 rounded-[10px] px-4 py-3 text-[13px] font-medium text-ink-muted"
          >
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}
