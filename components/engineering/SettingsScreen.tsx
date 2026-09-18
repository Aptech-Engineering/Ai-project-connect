"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Banknote, Bell, Check, CheckCircle2, Copy, CreditCard, Eye, EyeOff, KeyRound, Link2, Loader2, Lock, RotateCcw, Save, ShieldCheck, Trash2, Wallet, XCircle } from "lucide-react";
import { cn, formatDate } from "@/lib/format";
import { useStaff } from "@/lib/staff";
import {
  WEBHOOK_PATH,
  keyProblem,
  paystackProblem,
  saveSettings,
  testPaystack,
  useSettings,
  type NotificationDriver,
  type PaystackMode,
  type SecretMeta,
  type SettingsPatch,
} from "@/lib/settings";
import type { Notify } from "../PortalApp";
import { actingAs } from "./helpers";

const input = "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

type Draft = {
  payments: ReturnType<typeof useSettings>["payments"];
  paystack: { mode: PaystackMode; testPublicKey: string; livePublicKey: string };
  notifications: Omit<ReturnType<typeof useSettings>["notifications"], "smtpPassword" | "termiiApiKey">;
  secrets: Record<string, string | null>;
};

/** Where admins enter payment credentials, bank details and notification providers. */
export default function SettingsScreen({ notify }: { notify: Notify }) {
  const me = useStaff();
  const live = useSettings();
  const [draft, setDraft] = useState<Draft>(() => toDraft(live));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const setPayments = (patch: Partial<Draft["payments"]>) => setDraft((d) => ({ ...d, payments: { ...d.payments, ...patch } }));
  const setPaystack = (patch: Partial<Draft["paystack"]>) => setDraft((d) => ({ ...d, paystack: { ...d.paystack, ...patch } }));
  const setNotify = (patch: Partial<Draft["notifications"]>) => setDraft((d) => ({ ...d, notifications: { ...d.notifications, ...patch } }));
  const setSecret = (key: string, value: string | null) => setDraft((d) => ({ ...d, secrets: { ...d.secrets, [key]: value } }));

  const dirty = JSON.stringify(toDraft(live)) !== JSON.stringify(draft);
  const secretAfterSave = (key: "testSecretKey" | "liveSecretKey") => (draft.secrets[key] === null ? false : draft.secrets[key] ? true : live.paystack[key].set);

  const save = () => {
    const next: Record<string, string> = {};
    if (!/^\d{10}$/.test(draft.payments.accountNumber)) next.accountNumber = "Nigerian account numbers are 10 digits.";
    if (draft.payments.accountName.trim().length < 3) next.accountName = "Enter the account name exactly as the bank has it.";
    if (draft.payments.commitmentFee < 100) next.commitmentFee = "The fee must be at least ₦100.";
    if (!draft.payments.paystackEnabled && !draft.payments.manualEnabled) next.methods = "Keep at least one payment method on, or clients can't pay.";
    for (const [field, kind, mode] of [
      ["testPublicKey", "pk", "test"],
      ["livePublicKey", "pk", "live"],
    ] as const) {
      const problem = keyProblem(draft.paystack[field], kind, mode);
      if (problem) next[field] = problem;
    }
    for (const [field, mode] of [
      ["testSecretKey", "test"],
      ["liveSecretKey", "live"],
    ] as const) {
      const value = draft.secrets[field];
      const problem = typeof value === "string" ? keyProblem(value, "sk", mode) : null;
      if (problem) next[field] = problem;
    }
    if (draft.paystack.mode === "live" && draft.payments.paystackEnabled && (!secretAfterSave("liveSecretKey") || !draft.paystack.livePublicKey)) {
      next.mode = "Add both live keys before switching to live mode.";
    }
    if (draft.notifications.driver === "mail" && !draft.notifications.smtpHost.trim()) next.smtpHost = "Enter your mail server.";
    if (draft.notifications.driver === "termii" && !draft.notifications.termiiSenderId.trim()) next.termiiSenderId = "Enter the sender ID Termii approved for you.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const patch: SettingsPatch = {
      payments: draft.payments,
      paystack: { mode: draft.paystack.mode, testPublicKey: draft.paystack.testPublicKey.trim(), livePublicKey: draft.paystack.livePublicKey.trim(), testSecretKey: draft.secrets.testSecretKey ?? "", liveSecretKey: draft.secrets.liveSecretKey ?? "" },
      notifications: { ...draft.notifications, smtpPassword: draft.secrets.smtpPassword ?? "", termiiApiKey: draft.secrets.termiiApiKey ?? "" },
    };
    const changed = saveSettings(patch, actingAs(me));
    setDraft((d) => ({ ...d, secrets: {} }));
    notify(changed.length ? "Settings saved. They apply everywhere on the site." : "Nothing to save.", changed.length ? "success" : "info");
  };

  const problem = paystackProblem(live);
  const webhook = typeof window === "undefined" ? WEBHOOK_PATH : `${window.location.origin}${WEBHOOK_PATH}`;

  return (
    <div className="pb-28">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Admin</p>
      <h1 className="mt-1 font-display text-3xl font-bold">Settings</h1>
      <p className="mt-1 text-muted">Payment keys, the account clients transfer to, and how emails and SMS are sent. Everything here applies to the live site straight away.</p>

      <p className="mt-4 flex items-start gap-2 rounded-xl bg-blue-soft px-4 py-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-navy" />
        <span>
          Secret keys are encrypted and never shown again after saving — you&apos;ll only see the last 4 characters. If you lose one, generate a new one in your Paystack dashboard and paste it here.
        </span>
      </p>

      {problem && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-brand-soft px-4 py-3 text-sm font-bold text-brand-700">
          <AlertTriangle className="size-4" /> {problem}
        </p>
      )}

      <Section title="Commitment fee" icon={<Wallet className="size-5 text-brand" />} description="Clients pay this once before their idea reaches the inbox. The wording clients see is under Website content → Payments.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Text label="Amount" type="number" value={String(draft.payments.commitmentFee)} onChange={(v) => setPayments({ commitmentFee: Math.max(0, Math.round(Number(v) || 0)) })} error={errors.commitmentFee} />
          <Text label="Currency" value={draft.payments.currency} onChange={(v) => setPayments({ currency: v.toUpperCase().slice(0, 3) })} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Switch label="Let clients pay online (Paystack)" checked={draft.payments.paystackEnabled} onChange={(v) => setPayments({ paystackEnabled: v })} />
          <Switch label="Let clients pay by bank transfer" checked={draft.payments.manualEnabled} onChange={(v) => setPayments({ manualEnabled: v })} />
        </div>
        {errors.methods && <p className="mt-2 text-xs font-bold text-danger">{errors.methods}</p>}
      </Section>

      <Section title="Bank account for transfers" icon={<Banknote className="size-5 text-brand" />} description="Shown to clients who choose bank transfer. An admin confirms each transfer under Payments.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Text label="Bank" value={draft.payments.bankName} onChange={(v) => setPayments({ bankName: v })} />
          <Text label="Account name" value={draft.payments.accountName} onChange={(v) => setPayments({ accountName: v })} error={errors.accountName} />
          <Text label="Account number" value={draft.payments.accountNumber} onChange={(v) => setPayments({ accountNumber: v.replace(/\D/g, "").slice(0, 10) })} error={errors.accountNumber} inputMode="numeric" />
        </div>
      </Section>

      <Section title="Paystack" icon={<CreditCard className="size-5 text-brand" />} description="From your Paystack dashboard under Settings → API Keys & Webhooks.">
        <div role="radiogroup" aria-label="Paystack mode" className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["test", "Test mode", "Nothing is really charged. Use this while setting up."],
              ["live", "Live mode", "Real money moves. Clients are charged for real."],
            ] as const
          ).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={draft.paystack.mode === value}
              onClick={() => setPaystack({ mode: value })}
              className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition", draft.paystack.mode === value ? (value === "live" ? "border-teal bg-teal-soft/50 ring-2 ring-teal/20" : "border-brand bg-brand-soft/40 ring-2 ring-brand/20") : "border-line hover:border-navy/30")}
            >
              <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", draft.paystack.mode === value ? (value === "live" ? "border-teal bg-teal text-white" : "border-brand bg-brand text-white") : "border-line")}>{draft.paystack.mode === value && <Check className="size-3" />}</span>
              <span>
                <span className="block text-sm font-bold">{label}</span>
                <span className="text-xs text-muted">{hint}</span>
              </span>
            </button>
          ))}
        </div>
        {errors.mode && <p className="mt-2 text-xs font-bold text-danger">{errors.mode}</p>}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Text label="Test public key" value={draft.paystack.testPublicKey} onChange={(v) => setPaystack({ testPublicKey: v })} placeholder="pk_test_…" error={errors.testPublicKey} />
          <Secret label="Test secret key" placeholder="sk_test_…" meta={live.paystack.testSecretKey} value={draft.secrets.testSecretKey} onChange={(v) => setSecret("testSecretKey", v)} error={errors.testSecretKey} />
          <Text label="Live public key" value={draft.paystack.livePublicKey} onChange={(v) => setPaystack({ livePublicKey: v })} placeholder="pk_live_…" error={errors.livePublicKey} />
          <Secret label="Live secret key" placeholder="sk_live_…" meta={live.paystack.liveSecretKey} value={draft.secrets.liveSecretKey} onChange={(v) => setSecret("liveSecretKey", v)} error={errors.liveSecretKey} />
        </div>

        <div className="mt-4 rounded-xl bg-mist p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold">
            <Link2 className="size-3.5" /> Webhook URL — paste this into Paystack
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-xs">{webhook}</code>
            <CopyButton value={webhook} />
          </div>
          <p className="mt-1.5 text-xs text-muted">Paystack calls this to confirm payments. We never trust the browser for that.</p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={testing}
            onClick={() => {
              setTesting(true);
              setResult(null);
              window.setTimeout(() => {
                setResult(testPaystack());
                setTesting(false);
              }, 700);
            }}
            className="flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-bold hover:border-navy disabled:opacity-60"
          >
            {testing ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Test connection
          </button>
          <AnimatePresence>
            {result && (
              <motion.p initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} role="status" className={cn("flex items-center gap-1.5 text-sm font-bold", result.ok ? "text-teal-700" : "text-danger")}>
                {result.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />} {result.message}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        {dirty && <p className="mt-2 text-xs text-muted">Save first — the test uses the keys already saved.</p>}
      </Section>

      <Section title="Emails & SMS" icon={<Bell className="size-5 text-brand" />} description="How clients receive Project IDs, receipts and updates.">
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["log", "Outbox only", "Nothing is sent. Messages show under Notifications."],
              ["mail", "Email (SMTP)", "Your mail server sends the emails."],
              ["termii", "Email + SMS (Termii)", "Adds SMS for Project IDs and receipts."],
            ] as const
          ).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={draft.notifications.driver === value}
              onClick={() => setNotify({ driver: value as NotificationDriver })}
              className={cn("rounded-xl border p-3 text-left transition", draft.notifications.driver === value ? "border-brand bg-brand-soft/40 ring-2 ring-brand/20" : "border-line hover:border-navy/30")}
            >
              <span className="block text-sm font-bold">{label}</span>
              <span className="text-xs text-muted">{hint}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Text label="From name" value={draft.notifications.fromName} onChange={(v) => setNotify({ fromName: v })} />
          <Text label="From email" type="email" value={draft.notifications.fromEmail} onChange={(v) => setNotify({ fromEmail: v })} />
        </div>
        {draft.notifications.driver !== "log" && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Text label="SMTP host" value={draft.notifications.smtpHost} onChange={(v) => setNotify({ smtpHost: v })} placeholder="mail.yourdomain.com" error={errors.smtpHost} />
            <Text label="SMTP port" value={draft.notifications.smtpPort} onChange={(v) => setNotify({ smtpPort: v.replace(/\D/g, "").slice(0, 5) })} inputMode="numeric" />
            <Text label="SMTP username" value={draft.notifications.smtpUser} onChange={(v) => setNotify({ smtpUser: v })} />
            <Secret label="SMTP password" meta={live.notifications.smtpPassword} value={draft.secrets.smtpPassword} onChange={(v) => setSecret("smtpPassword", v)} />
          </div>
        )}
        {draft.notifications.driver === "termii" && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Secret label="Termii API key" meta={live.notifications.termiiApiKey} value={draft.secrets.termiiApiKey} onChange={(v) => setSecret("termiiApiKey", v)} />
            <Text label="Termii sender ID" value={draft.notifications.termiiSenderId} onChange={(v) => setNotify({ termiiSenderId: v.slice(0, 11) })} error={errors.termiiSenderId} />
          </div>
        )}
      </Section>

      {/* save bar */}
      <AnimatePresence>
        {dirty && (
          <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:pl-64">
            <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3">
              <p className="text-sm font-bold">You have unsaved settings.</p>
              <div className="flex gap-2">
                <button onClick={() => { setDraft(toDraft(live)); setErrors({}); }} className="flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-bold text-muted">
                  <RotateCcw className="size-4" /> Discard
                </button>
                <button onClick={save} className="flex h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-lg shadow-brand/20 hover:bg-brand-600">
                  <Save className="size-4" /> Save settings
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function toDraft(s: ReturnType<typeof useSettings>): Draft {
  const { smtpPassword, termiiApiKey, ...notifications } = s.notifications;
  return {
    payments: { ...s.payments },
    paystack: { mode: s.paystack.mode, testPublicKey: s.paystack.testPublicKey, livePublicKey: s.paystack.livePublicKey },
    notifications: { ...notifications },
    secrets: {},
  };
}

function Section({ title, icon, description, children }: { title: string; icon: React.ReactNode; description: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-2xl border border-line bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        {icon} {title}
      </h2>
      <p className="mb-4 mt-1 text-sm text-muted">{description}</p>
      {children}
    </section>
  );
}

function Text({ label, value, onChange, error, type = "text", placeholder, inputMode }: { label: string; value: string; onChange: (v: string) => void; error?: string; type?: string; placeholder?: string; inputMode?: "numeric" }) {
  return (
    <label className="block text-sm font-bold">
      {label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} aria-invalid={!!error} className={cn(input, "mt-1 font-normal", error && "border-danger/60")} />
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}

/** Write-only field: shows what's stored, never the value. */
function Secret({ label, meta, value, onChange, error, placeholder }: { label: string; meta: SecretMeta; value: string | null | undefined; onChange: (v: string | null) => void; error?: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  const editing = typeof value === "string";
  const cleared = value === null;

  if (!editing) {
    return (
      <div className="text-sm font-bold">
        {label}
        <div className={cn("mt-1 flex h-11 items-center gap-2 rounded-xl border px-3.5", cleared ? "border-danger/40 bg-danger-soft/30" : "border-line bg-mist")}>
          <Lock className="size-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate font-normal">
            {cleared ? (
              <span className="text-danger">Will be removed when you save</span>
            ) : meta.set ? (
              <>
                <span className="font-mono">••••{meta.last4}</span>
                {meta.updatedAt && <span className="ml-2 text-xs font-normal text-muted">saved {formatDate(meta.updatedAt)}</span>}
              </>
            ) : (
              <span className="text-muted">Not set</span>
            )}
          </span>
          <button type="button" onClick={() => onChange("")} className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-navy hover:bg-white">
            {meta.set ? "Replace" : "Add"}
          </button>
          {meta.set && !cleared && (
            <button type="button" onClick={() => onChange(null)} aria-label={`Remove ${label}`} className="shrink-0 rounded-lg p-1.5 text-muted hover:text-danger">
              <Trash2 className="size-4" />
            </button>
          )}
          {cleared && (
            <button type="button" onClick={() => onChange(undefined as unknown as string)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-navy hover:bg-white">
              Undo
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <label className="block text-sm font-bold">
      {label}
      <span className="mt-1 flex items-center gap-1 rounded-xl border border-line bg-white pr-1 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
        <input
          type={show ? "text" : "password"}
          value={value ?? ""}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          className="h-11 min-w-0 flex-1 rounded-xl bg-transparent px-3.5 font-mono text-sm font-normal outline-none"
        />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? `Hide ${label}` : `Show ${label}`} className="rounded-lg p-2 text-muted hover:text-navy">
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl bg-mist/70 px-4 py-3">
      <span className="text-sm font-bold">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 shrink-0 accent-[var(--color-brand)]" />
    </label>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => {});
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-xs font-bold hover:border-navy"
    >
      {copied ? <Check className="size-3.5 text-teal" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
    </button>
  );
}
