"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-serif text-[22px] text-ink">Something went wrong</h1>
      <p className="text-[13px] leading-relaxed text-ink-muted">
        This page hit an unexpected error. You can try again or refresh the browser.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-surface-raised shadow-soft"
      >
        Try again
      </button>
    </div>
  );
}
