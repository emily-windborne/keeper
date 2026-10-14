"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@lib/supabase";
import { clockToMinutes, minutesToClock } from "@/lib/notifications/digest";
import { DEFAULT_WAKE_MIN, DEFAULT_WIND_MIN } from "@/lib/planner/life-dump";
import { formatClock } from "@/lib/planner/clock-label";
import {
  browserTimeZone,
  isIphoneWithoutHomeScreen,
  turnOnPush,
} from "@/lib/notifications/push-client";
import {
  hhmmToMinutes,
  loadUserSettings,
  minutesToHHMM,
  saveUserSettings,
  type UserSettings,
} from "@/lib/settings/user-settings";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [dayStart, setDayStart] = useState("06:00");
  const [autoNext, setAutoNext] = useState(true);
  const [morningOn, setMorningOn] = useState(true);
  const [morningTime, setMorningTime] = useState("07:30");
  const [wakeTime, setWakeTime] = useState("08:00");
  const [windTime, setWindTime] = useState("22:00");
  const [pushOn, setPushOn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [turningOn, setTurningOn] = useState(false);
  const [needsHomeScreen, setNeedsHomeScreen] = useState(false);

  useEffect(() => {
    setNeedsHomeScreen(isIphoneWithoutHomeScreen());
    let cancelled = false;
    void (async () => {
      const settings = await loadUserSettings(supabase);
      if (cancelled) return;
      setDayStart(minutesToHHMM(settings.dayStartMinutes));
      setAutoNext(settings.autoScheduleNext);
      setMorningOn(settings.morningDigestEnabled);
      setMorningTime(minutesToClock(settings.morningDigestMinutes));
      setWakeTime(minutesToClock(settings.wakeMinutes));
      setWindTime(minutesToClock(settings.windDownMinutes));
      const { count, error } = await supabase
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true });
      if (!cancelled && !error) setPushOn((count ?? 0) > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/auth/signin");
    router.refresh();
  }

  function settingsFromForm(): UserSettings | string {
    const dayMinutes = hhmmToMinutes(dayStart);
    if (dayMinutes == null) return "Choose a start time between 12:00 AM and 8:00 PM.";
    const morningMinutes = clockToMinutes(morningTime);
    if (morningMinutes == null) return "Choose a morning time.";
    const wakeMinutes = clockToMinutes(wakeTime);
    const windMinutes = clockToMinutes(windTime);
    if (wakeMinutes == null || windMinutes == null || windMinutes <= wakeMinutes) {
      return "Wind-down has to be later than wake time.";
    }
    return {
      dayStartMinutes: dayMinutes,
      autoScheduleNext: autoNext,
      timezone: browserTimeZone(),
      morningDigestEnabled: morningOn,
      morningDigestMinutes: morningMinutes,
      wakeMinutes,
      windDownMinutes: windMinutes,
    };
  }

  async function saveSettings() {
    const next = settingsFromForm();
    if (typeof next === "string") {
      setMessage(next);
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
    const error = await saveUserSettings(supabase, user.id, next);
    setSaving(false);
    setMessage(error ?? "Saved.");
  }

  async function turnOnNotifications() {
    if (needsHomeScreen) {
      setMessage(
        "On iPhone, add Keeper to your home screen first, then open it from that icon. A Safari tab cannot turn notifications on.",
      );
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      setMessage("Notifications are not set up on the server yet. Add the notification keys, then try again.");
      return;
    }
    const next = settingsFromForm();
    if (typeof next === "string") {
      setMessage(next);
      return;
    }
    setTurningOn(true);
    setMessage(null);
    try {
      const subscription = await turnOnPush(VAPID_PUBLIC_KEY);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setMessage("Sign in to turn on notifications.");
        return;
      }
      const saved = await saveUserSettings(supabase, user.id, next);
      if (saved) {
        setMessage(saved);
        return;
      }
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
        { onConflict: "user_id,endpoint" },
      );
      if (error) {
        setMessage(
          /push_subscriptions|schema cache/i.test(error.message)
            ? "Notifications need a database update. Run supabase/migrations/008_notifications.sql, then try again."
            : error.message,
        );
        return;
      }
      setPushOn(true);
      setMessage("Notifications are on. You can switch the morning note off below.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not turn on notifications.");
    } finally {
      setTurningOn(false);
    }
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
        <span className="mb-2 block text-sm font-medium text-ink">Day starts at {formatClock(dayStart)}</span>
        <input
          type="time"
          value={dayStart}
          onChange={(e) => setDayStart(e.target.value)}
          className="min-h-11 w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
        />
        <span className="mt-1.5 block text-xs text-ink-muted">
          The planner will not place ordinary tasks before this time. The starting point is 6:00 AM.
        </span>
      </label>
      <label className="mb-8 flex min-h-11 max-w-sm items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5"
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

      <section className="mb-8 max-w-sm" aria-labelledby="my-day-heading">
        <h2 id="my-day-heading" className="font-serif text-[22px] font-normal text-ink">
          My day
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          Ordinary tasks stay between these times. Something you set to an exact time can sit outside them. The starting point is {formatClock(minutesToClock(DEFAULT_WAKE_MIN))} to {formatClock(minutesToClock(DEFAULT_WIND_MIN))}.
        </p>
        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-medium text-ink">Wake time {formatClock(wakeTime)}</span>
          <input
            type="time"
            value={wakeTime}
            onChange={(e) => setWakeTime(e.target.value)}
            className="min-h-11 w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
          />
        </label>
        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-medium text-ink">Wind-down {formatClock(windTime)}</span>
          <input
            type="time"
            value={windTime}
            onChange={(e) => setWindTime(e.target.value)}
            className="min-h-11 w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
          />
        </label>
      </section>

      <section className="mb-8 max-w-sm" aria-labelledby="notifications-heading">
        <h2 id="notifications-heading" className="font-serif text-[22px] font-normal text-ink">
          Notifications
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          On iPhone, add Keeper to your home screen first. In Safari, tap Share, then Add to Home Screen. Open Keeper from that icon, then tap Turn on notifications. A normal browser tab cannot ask for permission.
        </p>
        {needsHomeScreen && (
          <p className="mt-2 text-[13px] leading-relaxed text-ink">
            You are in a browser tab. Open the home-screen icon before turning notifications on.
          </p>
        )}
        <button
          type="button"
          onClick={() => void turnOnNotifications()}
          disabled={turningOn}
          className="mt-4 min-h-11 w-full rounded-[10px] bg-accent px-4 py-3 text-[13px] font-semibold text-surface-raised shadow-soft disabled:opacity-60"
        >
          {turningOn ? "Turning on…" : "Turn on notifications"}
        </button>
        {pushOn && (
          <p className="mt-2 text-[13px] text-ink-muted">Notifications are on for this phone.</p>
        )}

        <label className="mt-6 flex min-h-11 items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5"
            checked={morningOn}
            onChange={(e) => setMorningOn(e.target.checked)}
          />
          <span>
            Morning digest
            <span className="mt-1 block text-xs text-ink-muted">
              A short note about today, such as &quot;Today: 4 things. Start with Yoga.&quot; Tapping it opens today.
            </span>
          </span>
        </label>
        <label className="mt-3 block">
          <span className="mb-2 block text-sm font-medium text-ink">Morning time {formatClock(morningTime)}</span>
          <input
            type="time"
            value={morningTime}
            onChange={(e) => setMorningTime(e.target.value)}
            className="min-h-11 w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-base text-ink shadow-sm outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
          />
          <span className="mt-1.5 block text-xs text-ink-muted">
            Starts at 7:30 AM in your time zone. It goes out once each morning. In winter it may arrive closer to 6:30 AM.
          </span>
        </label>
      </section>

      <button
        type="button"
        onClick={() => void saveSettings()}
        disabled={saving}
        className="mb-3 min-h-11 self-start rounded-[10px] bg-accent px-4 py-3 text-[13px] font-semibold text-surface-raised shadow-soft disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save settings"}
      </button>
      {message && <p className="mb-6 text-[13px] text-ink-muted">{message}</p>}
      <button
        type="button"
        onClick={() => void signOut()}
        className="min-h-11 self-start rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-[13px] font-semibold text-ink shadow-soft hover:border-accent/20"
      >
        Sign out
      </button>
    </div>
  );
}
