"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@lib/supabase";
import {
  hhmmToMinutes,
  loadUserSettings,
  minutesToHHMM,
  saveUserSettings,
} from "@/lib/settings/user-settings";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [dayStart, setDayStart] = useState("06:00");
  const [autoNext, setAutoNext] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadUserSettings(supabase).then((settings) => {
      setDayStart(minutesToHHMM(settings.dayStartMinutes));
      setAutoNext(settings.autoScheduleNext);
    });
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/auth/signin");
    router.refresh();
  }

  async function saveDayStart() {
    const minutes = hhmmToMinutes(dayStart);
    if (minutes == null) {
      setMessage("Choose a start time between 12:00 AM and 8:00 PM.");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMessage("Sign in to save settings.");
      return;
    }
    setSaving(true);
    const current = await loadUserSettings(supabase);
    const error = await saveUserSettings(supabase, user.id, {
      ...current,
      dayStartMinutes: minutes,
      autoScheduleNext: autoNext,
    });
    setSaving(false);
    setMessage(error ?? "Saved.");
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
      <label className="mb-6 block max-w-sm">
        <span className="mb-2 block text-sm font-medium text-ink">Day starts at</span>
        <input
          type="time"
          value={dayStart}
          onChange={(e) => setDayStart(e.target.value)}
          className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
        />
        <span className="mt-1.5 block text-xs text-ink-muted">
          The planner will not place ordinary tasks before this time. The starting point is 6:00 AM.
        </span>
      </label>
      <label className="mb-6 flex min-h-11 max-w-sm items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-1"
          checked={autoNext}
          onChange={(e) => setAutoNext(e.target.checked)}
        />
        <span>
          When I finish a repeat, put the next one on the calendar.
          <span className="mt-1 block text-xs text-ink-muted">
            Keeper also fills a repeat that is already due and has no upcoming task. It will not use a time that has passed or one that is already booked.
          </span>
        </span>
      </label>
      <button
        type="button"
        onClick={() => void saveDayStart()}
        disabled={saving}
        className="mb-3 min-h-11 self-start rounded-[10px] bg-accent px-4 py-3 text-[13px] font-semibold text-surface-raised shadow-soft disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save settings"}
      </button>
      {message && <p className="mb-6 text-[13px] text-ink-muted">{message}</p>}
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
