"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/api";
import { signIn } from "@/lib/staff";

/**
 * Branded sign-in for the Analytics dashboard (spec 3.3 / 11.6).
 * Same accounts and the same session cookie as the Engineering Panel.
 */
export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
      router.push("/analytics?view=overview");
    } catch (err) {
      setError(errorMessage(err));
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy-950 px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "repeating-radial-gradient(circle at 20% 20%, rgba(38,70,122,0.35) 0, rgba(38,70,122,0.35) 1px, transparent 1px, transparent 64px)",
        }}
        aria-hidden
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white font-display text-sm font-semibold text-navy">AI</div>
          <span className="font-display text-sm font-semibold text-white">AI Project Connect</span>
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">ANALYTICS</span>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow-soft">
          <h1 className="font-display text-lg font-semibold text-navy">Sign in to Analytics</h1>
          <p className="mt-1 text-sm text-muted">Use your AI Project Connect staff account.</p>

          <label htmlFor="analytics-email" className="mt-5 block text-xs font-medium text-navy">
            Work email
          </label>
          <input
            id="analytics-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            autoFocus
            className="focus-ring mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
          />

          <label htmlFor="analytics-password" className="mt-4 block text-xs font-medium text-navy">
            Password
          </label>
          <div className="relative mt-1">
            <input
              id="analytics-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="focus-ring w-full rounded-xl border border-line px-3 py-2 pr-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="focus-ring absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted hover:text-navy"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <p aria-live="polite">{error && <span className="mt-3 block rounded-xl bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">{error}</span>}</p>

          <button
            type="submit"
            disabled={busy}
            className="focus-ring mt-5 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in →"}
          </button>

          <Link href="/engineering" className="focus-ring mt-3 block text-center text-xs text-muted hover:text-navy">
            Forgot password?
          </Link>
        </form>

        <p className="mt-4 text-center text-xs text-navy-600">
          Looking for the Engineering Panel?{" "}
          <Link href="/engineering" className="underline hover:text-white">
            Open it here
          </Link>
        </p>
      </div>
    </div>
  );
}
