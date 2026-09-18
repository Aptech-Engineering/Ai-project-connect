"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, GitPullRequestArrow, Layers, Loader2, Lock, ShieldCheck, User } from "lucide-react";
import Logo from "../Logo";
import { signIn, type StaffUser } from "@/lib/staff";
import { ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/format";
import { ForgotPassword, ResetPassword } from "./PasswordRecovery";

const MAX_ATTEMPTS = 5;

export default function StaffLogin({ onSuccess, resetToken, onResetDone }: { onSuccess: (user: StaffUser) => void | Promise<void>; resetToken?: string | null; onResetDone?: () => void }) {
  const [view, setView] = useState<"login" | "forgot">("login");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const shake = useAnimationControls();
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const lockedFor = Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  useEffect(() => {
    if (!lockedUntil) return;
    const t = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= lockedUntil) {
        setLockedUntil(0);
        setError("");
      }
    }, 500);
    return () => window.clearInterval(t);
  }, [lockedUntil]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || lockedFor > 0) return;
    if (!login.trim() || !password) {
      setError("Enter your work email and password.");
      shake.start({ x: [0, -10, 10, -7, 7, -3, 0], transition: { duration: 0.45 } });
      return;
    }
    setBusy(true);
    setError("");
    // "aptechdevteam.com" was the original demo login; it now maps to the admin account.
    const email = login.trim().toLowerCase() === "aptechdevteam.com" ? "admin@aptechdevteam.com" : login.trim();
    try {
      const user = await signIn(email, password);
      await onSuccess(user);
      return;
    } catch (e) {
      setBusy(false);
      shake.start({ x: [0, -10, 10, -7, 7, -3, 0], transition: { duration: 0.45 } });
      setPassword("");
      // The server rate-limits too; this keeps the form quiet for a moment as well.
      const n = attempts + 1;
      if (e instanceof ApiError && e.status === 429) {
        setAttempts(0);
        setNow(Date.now());
        setLockedUntil(Date.now() + 30_000);
        setError(e.message);
      } else if (n >= MAX_ATTEMPTS) {
        setAttempts(0);
        setNow(Date.now());
        setLockedUntil(Date.now() + 30_000);
        setError("Too many failed attempts. Sign-in is locked for 30 seconds.");
      } else {
        setAttempts(n);
        setError(errorMessage(e));
      }
    }
  };

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_1fr]">
      {/* brand panel */}
      <aside className="relative isolate hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col">
        <div aria-hidden className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-navy-700/70 to-transparent" style={{ clipPath: "polygon(40% 0, 100% 0, 100% 75%)" }} />
          <div className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_30%_60%,black,transparent_70%)]" />
          <svg className="absolute -right-48 -top-48 size-[760px]" viewBox="0 0 760 760" fill="none">
            {Array.from({ length: 8 }).map((_, i) => (
              <circle key={i} cx="380" cy="380" r={60 + i * 44} stroke="rgba(160,190,230,0.15)" />
            ))}
          </svg>
          <motion.div
            className="absolute right-0 top-[48%] h-56 w-48 bg-gradient-to-l from-brand to-brand-600"
            style={{ clipPath: "polygon(100% 0, 100% 100%, 0 50%)" }}
            initial={{ x: 100 }}
            animate={{ x: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        <Link href="/">
          <Logo />
        </Link>

        <div className="mt-auto max-w-md">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">For Aptech engineers</p>
          <h1 className="mt-3 font-display text-5xl font-extrabold leading-[1.05] tracking-tight">
            Engineering <span className="text-brand">Panel</span>
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-white/70">
            One place to move projects forward and keep every client in the loop, without the &ldquo;how far?&rdquo; calls.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              { icon: Layers, text: "Move projects through stages and set progress" },
              { icon: GitPullRequestArrow, text: "Post client-visible updates or internal notes" },
              { icon: ShieldCheck, text: "Approve updates before clients see them" },
            ].map(({ icon: Icon, text }, i) => (
              <motion.li
                key={text}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-3 text-white/85"
              >
                <span className="grid size-9 place-items-center rounded-xl bg-white/10">
                  <Icon className="size-4 text-brand" />
                </span>
                {text}
              </motion.li>
            ))}
          </ul>
        </div>
        <p className="mt-12 text-xs text-white/40">Confidential client information. Authorised Aptech staff only.</p>
      </aside>

      {/* form */}
      <main className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="lg:hidden">
            <span className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-[10px] bg-brand font-display text-[15px] font-bold text-white">AI</span>
              <span className="font-display font-semibold">AI Project Connect</span>
            </span>
          </Link>
          <Link href="/" className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted transition hover:text-navy">
            <ArrowLeft className="size-4" /> Client portal
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          {resetToken ? (
            <ResetPassword token={resetToken} onDone={() => onResetDone?.()} />
          ) : view === "forgot" ? (
            <ForgotPassword onBack={() => setView("login")} />
          ) : (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft">
              <Lock className="size-6 text-brand-700" />
            </span>
            <h2 className="mt-5 font-display text-3xl font-bold">Staff sign in</h2>
            <p className="mt-2 text-muted">Sign in to the Engineering Panel to manage your projects.</p>

            <motion.form
              animate={shake}
              onSubmit={submit}
              noValidate
              className="mt-8 space-y-4"
            >
              <Field label="Work email" htmlFor="staff-login">
                <User className="size-5 text-muted" />
                <input
                  id="staff-login"
                  value={login}
                  onChange={(e) => {
                    setLogin(e.target.value);
                    if (!lockedFor) setError("");
                  }}
                  autoComplete="username"
                  autoFocus
                  spellCheck={false}
                  placeholder="you@aptech.com"
                  disabled={lockedFor > 0}
                  className="h-12 w-full bg-transparent outline-none placeholder:text-muted/70"
                />
              </Field>

              <div className="-mb-2 flex justify-end">
                <button type="button" onClick={() => setView("forgot")} className="text-xs font-bold text-brand-700 hover:underline">
                  Forgot password?
                </button>
              </div>
              <Field label="Password" htmlFor="staff-password">
                <Lock className="size-5 text-muted" />
                <input
                  id="staff-password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (!lockedFor) setError("");
                  }}
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  disabled={lockedFor > 0}
                  className="h-12 w-full bg-transparent outline-none placeholder:text-muted/70"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="rounded-md p-1 text-muted hover:text-navy"
                >
                  {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </Field>

              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    role="alert"
                    className="flex items-start gap-2 overflow-hidden rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={busy || lockedFor > 0}
                className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-navy font-display font-semibold text-white transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {busy ? (
                  <>
                    <Loader2 className="size-5 animate-spin" /> Signing in…
                  </>
                ) : lockedFor > 0 ? (
                  <>Try again in {lockedFor}s</>
                ) : (
                  <>
                    Sign in <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </motion.form>

            <p className="mt-6 flex items-center gap-2 text-xs text-muted">
              <ShieldCheck className="size-4 text-teal" /> Sessions end when you close the browser tab.
            </p>
          </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-bold">
        {label}
      </label>
      <div
        className={cn(
          "mt-1.5 flex items-center gap-3 rounded-xl border border-line bg-mist/60 px-3.5 transition",
          "focus-within:border-brand focus-within:bg-white focus-within:ring-4 focus-within:ring-brand/15",
        )}
      >
        {children}
      </div>
    </div>
  );
}
