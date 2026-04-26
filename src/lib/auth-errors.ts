/**
 * Maps low-level Supabase/auth errors to actionable copy for email/password flows.
 */
export function formatAuthErrorMessage(raw: string): string {
  const t = raw.trim();
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(t)) {
    return [
      "Could not reach Supabase (network error).",
      "Confirm NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local match Project Settings → API, then restart npm run dev.",
      "Check that the Supabase project is not paused, and try disabling VPN or ad blockers temporarily.",
    ].join(" ");
  }
  return t;
}
