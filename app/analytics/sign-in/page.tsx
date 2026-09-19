"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setRole } from "@/lib/mock/session";

// Branded sign-in, per spec 3.3 / 11.6. The real build posts to
// POST /api/staff/auth/login with { email, password } and shares the Engineering Panel
// session cookie — wiring that up is out of scope here per your note, so this signs the
// demo session in locally and drops you straight into Overview.
export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@aptechdevteam.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRole("admin");
    router.push("/analytics?view=overview");
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white font-display text-sm font-semibold text-navy">
            AI
          </div>
          <span className="font-display text-sm font-semibold text-white">AI Project Connect</span>
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
            ANALYTICS
          </span>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow-soft">
          <h1 className="font-display text-lg font-semibold text-navy">Sign in to Analytics</h1>
          <p className="mt-1 text-sm text-muted">Use your AI Project Connect staff account.</p>

          <label className="mt-5 block text-xs font-medium text-navy">Work email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="focus-ring mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
          />

          <label className="mt-4 block text-xs font-medium text-navy">Password</label>
          <div className="relative mt-1">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="focus-ring w-full rounded-xl border border-line px-3 py-2 pr-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="focus-ring absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              👁
            </button>
          </div>

          <button
            type="submit"
            className="focus-ring mt-5 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Sign in →
          </button>

          <button type="button" className="focus-ring mt-3 block w-full text-center text-xs text-muted hover:text-navy">
            Forgot password?
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-navy-600">
          Looking for the Engineering Panel? <span className="underline">→</span>
        </p>
      </div>
    </div>
  );
}
