"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Mail, ShieldAlert } from "lucide-react";
import { sendNotice } from "@/lib/store";
import { findValidReset, requestPasswordReset, resetPasswordWithToken } from "@/lib/staff";

const inputClass = "h-12 w-full rounded-xl border border-line bg-mist/60 px-3.5 text-sm outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15";

/** "Forgot password?" — always shows the same message so staff emails can't be discovered. */
export function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [demoToken, setDemoToken] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return;
    setBusy(true);
    const [token] = await Promise.all([requestPasswordReset(email), new Promise((r) => window.setTimeout(r, 700))]);
    if (token) {
      sendNotice({
        audience: "staff",
        channel: "email",
        to: email.trim().toLowerCase(),
        subject: "Reset your AI Project Connect password",
        body: `Choose a new password here (expires in 1 hour, works once):\n/engineering?reset=${token}\n\nIf this wasn't you, ignore this email.`,
      });
    }
    setDemoToken(token);
    setBusy(false);
    setSent(true);
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-bold text-muted hover:text-navy">
        <ArrowLeft className="size-4" /> Back to sign in
      </button>
      <span className="mt-6 grid size-12 place-items-center rounded-2xl bg-brand-soft">
        <KeyRound className="size-6 text-brand-700" />
      </span>
      <h2 className="mt-5 font-display text-3xl font-bold">Forgot your password?</h2>
      {sent ? (
        <>
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-teal-soft px-4 py-3 text-sm text-teal-700">
            <Mail className="mt-0.5 size-4 shrink-0" />
            If that email belongs to an active staff account, a reset link is on its way. It expires in 1 hour.
          </p>
          {demoToken && (
            <a href={`/engineering?reset=${demoToken}`} className="mt-4 flex h-11 items-center justify-center rounded-xl border border-dashed border-brand/50 text-sm font-bold text-brand-700 hover:bg-brand-soft/40">
              Demo: open the reset link from the email
            </a>
          )}
        </>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <p className="text-muted">Enter your work email and we&apos;ll send you a link to choose a new password.</p>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Work email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus className={inputClass} />
          </label>
          <button disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-navy font-display font-semibold text-white hover:bg-navy-700 disabled:opacity-50">
            {busy && <Loader2 className="size-5 animate-spin" />} Send reset link
          </button>
        </form>
      )}
    </motion.div>
  );
}

/** Opened from the emailed link: /engineering?reset=TOKEN */
export function ResetPassword({ token, onDone }: { token: string; onDone: () => void }) {
  const [state, setState] = useState<"checking" | "invalid" | "form" | "done">("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    findValidReset(token).then((found) => {
      if (!found) return setState("invalid");
      setEmail(found.user.email);
      setState("form");
    });
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    const user = await resetPasswordWithToken(token, password);
    setBusy(false);
    if (!user) return setState("invalid");
    sendNotice({ audience: "staff", channel: "email", to: user.email, subject: "Your password was changed", body: `Hi ${user.name},\n\nThe password for your staff account was just changed. If this wasn't you, contact an admin immediately.` });
    setState("done");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      {state === "checking" && <Loader2 className="mx-auto size-8 animate-spin text-brand" />}
      {state === "invalid" && (
        <>
          <ShieldAlert className="size-10 text-danger" />
          <h2 className="mt-4 font-display text-3xl font-bold">Link expired</h2>
          <p className="mt-2 text-muted">This reset link is invalid, already used or older than 1 hour. Request a new one.</p>
          <button onClick={onDone} className="mt-6 h-12 w-full rounded-xl bg-navy font-bold text-white">
            Back to sign in
          </button>
        </>
      )}
      {state === "done" && (
        <>
          <CheckCircle2 className="size-10 text-teal" />
          <h2 className="mt-4 font-display text-3xl font-bold">Password updated</h2>
          <p className="mt-2 text-muted">You can sign in with your new password now.</p>
          <button onClick={onDone} className="mt-6 h-12 w-full rounded-xl bg-navy font-bold text-white">
            Sign in
          </button>
        </>
      )}
      {state === "form" && (
        <form onSubmit={submit} className="space-y-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft">
            <KeyRound className="size-6 text-brand-700" />
          </span>
          <h2 className="font-display text-3xl font-bold">Choose a new password</h2>
          <p className="text-sm text-muted">For {email}</p>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">New password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus className={inputClass} />
            <span className="mt-1 block text-xs text-muted">At least 10 characters.</span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Confirm new password</span>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className={inputClass} />
          </label>
          {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger">{error}</p>}
          <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-navy font-display font-semibold text-white disabled:opacity-60">
            {busy && <Loader2 className="size-5 animate-spin" />} Update password
          </button>
        </form>
      )}
    </motion.div>
  );
}
