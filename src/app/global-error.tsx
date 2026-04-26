"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-dvh bg-[#f6f4f0] font-sans text-[#0f394c] antialiased">
        <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-[22px] font-semibold">Something went wrong</h1>
          <p className="text-[13px] leading-relaxed opacity-70">
            Please try again. If the problem continues, refresh the page.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-[10px] bg-[#caa510] px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
