"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@lib/supabase";

export default function SettingsPage() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/signin");
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="mb-6 sm:mb-8">
        <h1 className="font-serif text-[26px] font-normal leading-tight tracking-tight text-ink sm:text-[26px]">
          Settings
        </h1>
        <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-ink-muted">
          Account and preferences.
        </p>
      </header>
      <button
        type="button"
        onClick={() => void signOut()}
        className="self-start rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-[13px] font-semibold text-ink shadow-soft hover:border-accent/20"
      >
        Sign out
      </button>
    </div>
  );
}
