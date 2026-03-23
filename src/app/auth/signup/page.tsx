"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@lib/supabase";

export default function SignUpPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12 sm:px-8">
      <div className="rounded-[20px] border border-border bg-surface-raised p-8 shadow-soft sm:p-10">
        <h1 className="font-serif text-[26px] font-normal leading-tight tracking-tight text-ink">
          Create account
        </h1>
        <p className="mt-2 font-sans text-[13px] leading-relaxed text-ink-muted">
          Start using Keeper with email and password.
        </p>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-2 block font-sans text-[13px] font-medium text-ink-muted">
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 font-sans text-[15px] text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent/45 focus:ring-2 focus:ring-accent/15"
              placeholder="you@example.com"
            />
          </label>
          <label className="block">
            <span className="mb-2 block font-sans text-[13px] font-medium text-ink-muted">
              Password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 font-sans text-[15px] text-ink shadow-sm outline-none focus:border-accent/45 focus:ring-2 focus:ring-accent/15"
            />
          </label>
          {error && (
            <p className="font-sans text-[13px] text-red-800/90" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[10px] bg-accent px-4 py-3.5 font-sans text-[15px] font-semibold text-surface-raised shadow-[0_6px_18px_rgba(202,165,16,0.32)] transition-opacity hover:opacity-[0.96] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating…" : "Sign up"}
          </button>
        </form>

        <p className="mt-6 text-center font-sans text-[13px] text-ink-muted">
          Already have an account?{" "}
          <Link
            href="/auth/signin"
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
