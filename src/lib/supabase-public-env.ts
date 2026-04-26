/**
 * Browser + Edge + Node: resolve public Supabase env.
 * Accepts either key name — Supabase dashboard labels the anon key; templates often use ANON_KEY.
 */
export function getSupabasePublicEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  // Leaving the .env.example placeholder in place causes DNS / fetch failures — treat as unset.
  if (/your-project\.supabase\.co/i.test(url) || /^https:\/\/your-project/i.test(url)) {
    return null;
  }
  if (!/^https:\/\//i.test(url)) {
    return null;
  }
  return { url, key };
}
