import type { SupabaseClient } from "@supabase/supabase-js";
import {
  protectedWindowsFromUnknown,
  WEEKDAY_NAMES,
  type ProtectedWindow,
} from "@/lib/planner/protected-time";

const MIGRATION_HINT =
  "Protected time needs a database update. Run supabase/migrations/010_protected_times.sql, then try again.";

export async function loadProtectedTimes(supabase: SupabaseClient): Promise<ProtectedWindow[]> {
  const { data, error } = await supabase
    .from("protected_times")
    .select("id, name, days, start_minutes, end_minutes")
    .order("start_minutes", { ascending: true });
  if (error || !data) return [];
  return protectedWindowsFromUnknown(data);
}

export async function saveProtectedTime(
  supabase: SupabaseClient,
  userId: string,
  window: ProtectedWindow,
): Promise<string | null> {
  const days = window.days
    .map((day) => day.toLowerCase())
    .filter((day) => (WEEKDAY_NAMES as readonly string[]).includes(day));
  const { error } = await supabase.from("protected_times").upsert({
    id: window.id,
    user_id: userId,
    name: window.name.trim(),
    days,
    start_minutes: window.startMin,
    end_minutes: window.endMin,
    updated_at: new Date().toISOString(),
  });
  if (!error) return null;
  if (/protected_times|schema cache/i.test(error.message)) return MIGRATION_HINT;
  return error.message;
}

export async function deleteProtectedTime(supabase: SupabaseClient, id: string): Promise<string | null> {
  const { error } = await supabase.from("protected_times").delete().eq("id", id);
  if (!error) return null;
  if (/protected_times|schema cache/i.test(error.message)) return MIGRATION_HINT;
  return error.message;
}
