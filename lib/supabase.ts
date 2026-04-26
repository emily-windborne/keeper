import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "@/lib/supabase-public-env";

/**
 * Browser client for `"use client"` modules.
 * During SSR, `useMemo(() => createClient(), [])` still runs once on the server; throwing here
 * surfaces as a document 500 on refresh. If env is missing only on the SSR pass, use a stub URL
 * (no session); after hydration the client bundle uses real env when present.
 */
export function createClient() {
  const env = getSupabasePublicEnv();
  if (env) {
    return createBrowserClient(env.url, env.key);
  }
  if (typeof window === "undefined") {
    return createBrowserClient(
      "https://placeholder.supabase.co",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder",
    );
  }
  throw new Error(
    "Missing Supabase env: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) in .env.local",
  );
}
