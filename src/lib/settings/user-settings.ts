import type { SupabaseClient } from "@supabase/supabase-js";
import { MORNING_DEFAULT_MINUTES } from "@/lib/notifications/digest";
import { DEFAULT_WAKE_MIN, DEFAULT_WIND_MIN } from "@/lib/planner/life-dump";
import { DEFAULT_DAY_START_MIN } from "@/lib/planner/plan-my-week";

export type UserSettings = {
  dayStartMinutes: number;
  autoScheduleNext: boolean;
  timezone: string | null;
  morningDigestEnabled: boolean;
  morningDigestMinutes: number;
  wakeMinutes: number;
  windDownMinutes: number;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  dayStartMinutes: DEFAULT_DAY_START_MIN,
  autoScheduleNext: true,
  timezone: null,
  morningDigestEnabled: true,
  morningDigestMinutes: MORNING_DEFAULT_MINUTES,
  wakeMinutes: DEFAULT_WAKE_MIN,
  windDownMinutes: DEFAULT_WIND_MIN,
};

function clampDayStart(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_DAY_START_MIN;
  return Math.min(20 * 60, Math.max(0, Math.round(n)));
}

function clampClock(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(23 * 60 + 59, Math.max(0, Math.round(n)));
}

export function minutesToHHMM(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function hhmmToMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 20 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export async function loadUserSettings(supabase: SupabaseClient): Promise<UserSettings> {
  const { data, error } = await supabase.from("user_settings").select("*").maybeSingle();
  if (error || !data) return DEFAULT_USER_SETTINGS;
  const row = data as {
    day_start_minutes?: number;
    auto_schedule_next?: boolean;
    timezone?: string | null;
    morning_digest_enabled?: boolean;
    morning_digest_minutes?: number;
    wake_minutes?: number;
    wind_down_minutes?: number;
  };
  return {
    dayStartMinutes: clampDayStart(row.day_start_minutes),
    autoScheduleNext: row.auto_schedule_next !== false,
    timezone: typeof row.timezone === "string" && row.timezone.trim() ? row.timezone : null,
    morningDigestEnabled: row.morning_digest_enabled !== false,
    morningDigestMinutes: clampClock(row.morning_digest_minutes, MORNING_DEFAULT_MINUTES),
    wakeMinutes: clampClock(row.wake_minutes, DEFAULT_WAKE_MIN),
    windDownMinutes: clampClock(row.wind_down_minutes, DEFAULT_WIND_MIN),
  };
}

export async function saveUserSettings(
  supabase: SupabaseClient,
  userId: string,
  settings: UserSettings,
): Promise<string | null> {
  const { error } = await supabase.from("user_settings").upsert({
    user_id: userId,
    day_start_minutes: clampDayStart(settings.dayStartMinutes),
    auto_schedule_next: settings.autoScheduleNext,
    timezone: settings.timezone,
    morning_digest_enabled: settings.morningDigestEnabled,
    morning_digest_minutes: clampClock(settings.morningDigestMinutes, MORNING_DEFAULT_MINUTES),
    wake_minutes: clampClock(settings.wakeMinutes, DEFAULT_WAKE_MIN),
    wind_down_minutes: clampClock(settings.windDownMinutes, DEFAULT_WIND_MIN),
    updated_at: new Date().toISOString(),
  });
  if (!error) return null;
  if (/wake_minutes|wind_down/i.test(error.message)) {
    return "Settings need a database update. Run supabase/migrations/009_my_day.sql, then try again.";
  }
  if (/user_settings|morning_digest|timezone/i.test(error.message)) {
    return "Settings need a database update. Run supabase/migrations/008_notifications.sql, then try again.";
  }
  return error.message;
}
