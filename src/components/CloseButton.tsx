"use client";

import { X } from "lucide-react";

export function CloseButton({ onClick, label = "Close" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#0f394c]/70 hover:bg-black/5 hover:text-[#0f394c]"
    >
      <X size={20} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
