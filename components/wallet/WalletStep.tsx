"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Building2, Check, CheckCircle2, Clock, Copy, CreditCard, FileText, Landmark, Loader2, Lock, ShieldCheck, UploadCloud, Wallet, X } from "lucide-react";
import { usePaymentSettings } from "@/lib/settings";
import { formatPrice } from "@/lib/catalog";
import { formatBytes, saveFile, type StoredFileMeta } from "@/lib/files";
import { cn } from "@/lib/format";
import type { Idea } from "@/lib/ideas";
import { claimManualPayment, completePaystack, currentPayment, feeState, lastFailedPayment, startPaystack } from "@/lib/wallet";
import WalletLedger from "./WalletLedger";

const PROOF_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const PROOF_MAX = 5 * 1024 * 1024;

const input = "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-navy outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-4 focus:ring-brand/15";

/** Step 4 of the idea form: fund the project wallet with the commitment fee. */
export default function WalletStep({ idea, token }: { idea: Idea; token: string }) {
  const payments = usePaymentSettings();
  const state = feeState(idea);
  const payment = currentPayment(idea);
  const failed = lastFailedPayment(idea);
  const fee = formatPrice(payments.commitmentFee, payments.currency);
  const [method, setMethod] = useState<"paystack" | "manual">(payments.paystackEnabled ? "paystack" : "manual");
  const [checkout, setCheckout] = useState<{ reference: string; amount: number; currency: string; email: string } | null>(null);
  const [error, setError] = useState("");

  const funded = state === "PAID" ? payment!.amount : 0;

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-bold">{payments.feeTitle}</h3>
      {/* wallet card */}
      <div className="relative overflow-hidden rounded-2xl bg-navy p-5 text-white">
        <svg aria-hidden className="absolute -right-10 -top-12 size-44" viewBox="0 0 200 200" fill="none">
          {[40, 65, 90].map((r) => (
            <circle key={r} cx="100" cy="100" r={r} stroke="rgba(160,190,230,0.14)" />
          ))}
        </svg>
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white/60">
              <Wallet className="size-4 text-brand" /> Project wallet · {idea.ref}
            </p>
            <p className="mt-2 font-display text-3xl font-bold">
              {formatPrice(funded, payments.currency)}
              <span className="ml-2 text-base font-normal text-white/55">of {fee}</span>
            </p>
          </div>
          <StatePill state={state} />
        </div>
        <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/15">
          <motion.div className="h-full rounded-full bg-teal" initial={false} animate={{ width: state === "PAID" ? "100%" : state === "AWAITING_CONFIRMATION" ? "60%" : "0%" }} transition={{ duration: 0.6 }} />
        </div>
        <p className="relative mt-3 text-sm text-white/70">{payments.feeExplainer}</p>
      </div>

      {state === "PAID" && (
        <Banner tone="good" icon={<CheckCircle2 className="size-5" />} title="Your wallet is funded">
          Receipt <b className="font-mono">{payment!.receiptNo}</b> is in your email. You can submit your idea now.
        </Banner>
      )}
      {state === "AWAITING_CONFIRMATION" && (
        <Banner tone="wait" icon={<Clock className="size-5" />} title="We're checking your transfer">
          You can submit your idea now. Our team confirms transfers within {payments.confirmationTime}, and your idea is approved only after that.
        </Banner>
      )}
      {failed && state === "UNPAID" && (
        <Banner tone="bad" icon={<AlertTriangle className="size-5" />} title="Your last payment didn't go through">
          {failed.failureReason} Please try again.
        </Banner>
      )}

      {(state === "UNPAID" || state === "PENDING") && (
        <>
          <div role="tablist" aria-label="Payment method" className="grid grid-cols-2 gap-2 rounded-2xl bg-mist p-1">
            {(
              [
                ["paystack", CreditCard, "Pay online", payments.paystackEnabled],
                ["manual", Landmark, "Bank transfer", payments.manualEnabled],
              ] as const
            )
              .filter(([, , , on]) => on)
              .map(([key, Icon, label]) => (
                <button
                  key={key}
                  role="tab"
                  type="button"
                  aria-selected={method === key}
                  onClick={() => setMethod(key)}
                  className={cn("flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition", method === key ? "bg-white text-navy shadow-sm" : "text-muted hover:text-navy")}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
          </div>

          {method === "paystack" ? (
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm text-muted">Pay with your card, bank app, USSD or bank transfer through Paystack. Your wallet updates as soon as Paystack confirms the payment.</p>
              {error && <p className="mt-2 text-xs font-bold text-danger">{error}</p>}
              <button
                type="button"
                onClick={() => {
                  setError("");
                  const r = startPaystack(token);
                  if (!r.ok) return setError(r.error);
                  setCheckout(r);
                }}
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal font-display text-sm font-semibold text-white shadow-lg shadow-teal/20 transition hover:bg-teal-700"
              >
                <Lock className="size-4" /> Pay {fee} with Paystack
              </button>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted">
                <ShieldCheck className="size-3.5 text-teal" /> Secured by Paystack. We never see your card details.
              </p>
            </div>
          ) : (
            <ManualTransfer idea={idea} token={token} fee={fee} />
          )}
        </>
      )}

      {(idea.payments?.length ?? 0) > 0 && <WalletLedger idea={idea} compact />}

      <AnimatePresence>{checkout && <PaystackCheckout {...checkout} onDone={(ok) => { completePaystack(checkout.reference, ok); setCheckout(null); }} />}</AnimatePresence>
    </div>
  );
}

function ManualTransfer({ idea, token, fee }: { idea: Idea; token: string; fee: string }) {
  const payments = usePaymentSettings();
  const [form, setForm] = useState({
    senderName: idea.name,
    senderBank: "",
    transferDate: new Date().toISOString().slice(0, 10),
    refundName: idea.refundAccount?.name ?? idea.name,
    refundNumber: idea.refundAccount?.number ?? "",
    refundBank: idea.refundAccount?.bank ?? "",
  });
  const [proof, setProof] = useState<StoredFileMeta | undefined>();
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const claim = () => {
    const e: Record<string, string> = {};
    if (form.senderName.trim().length < 2) e.senderName = "Whose account did it come from?";
    if (form.senderBank.trim().length < 2) e.senderBank = "Which bank or app?";
    if (!form.transferDate) e.transferDate = "When did you send it?";
    if (form.refundName.trim().length < 2) e.refundName = "Enter the account name.";
    if (!/^\d{10}$/.test(form.refundNumber.trim())) e.refundNumber = "Enter a 10-digit account number.";
    if (form.refundBank.trim().length < 2) e.refundBank = "Enter the bank.";
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    const r = claimManualPayment(token, {
      senderName: form.senderName.trim(),
      senderBank: form.senderBank.trim(),
      transferDate: form.transferDate,
      proof,
      refundAccount: { name: form.refundName.trim(), number: form.refundNumber.trim(), bank: form.refundBank.trim() },
    });
    if (!r.ok) setErrors({ form: r.error });
  };

  const rows: [string, string][] = [
    ["Bank", payments.bankName],
    ["Account name", payments.accountName],
    ["Account number", payments.accountNumber],
    ["Amount", fee],
    ["Narration", idea.ref],
  ];

  return (
    <div className="space-y-4 rounded-2xl border border-line p-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-bold">
          <Building2 className="size-4 text-brand" /> 1. Send {fee} to this account
        </p>
        <dl className="mt-2 divide-y divide-line rounded-xl bg-mist px-3.5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-muted">{label}</dt>
              <dd className="flex items-center gap-2 text-right font-bold">
                <span className={cn(label === "Account number" || label === "Narration" ? "font-mono tracking-wide" : "")}>{value}</span>
                {(label === "Account number" || label === "Narration") && <CopyButton value={value} label={label} />}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted">{payments.transferInstructions}</p>
      </div>

      <div>
        <p className="text-sm font-bold">2. Tell us about your transfer</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Input label="Sender's name" value={form.senderName} onChange={(v) => set("senderName", v)} error={errors.senderName} />
          <Input label="Bank or app" value={form.senderBank} onChange={(v) => set("senderBank", v)} error={errors.senderBank} placeholder="e.g. GTBank, Opay" />
          <Input label="Date sent" type="date" value={form.transferDate} onChange={(v) => set("transferDate", v)} error={errors.transferDate} />
        </div>
        <div className="mt-3">
          {proof ? (
            <div className="flex items-center gap-2 rounded-xl bg-teal-soft/60 px-3 py-2.5 text-sm">
              <FileText className="size-4 text-teal-700" />
              <span className="min-w-0 flex-1 truncate font-bold">{proof.name}</span>
              <span className="text-xs text-muted">{formatBytes(proof.size)}</span>
              <button type="button" onClick={() => setProof(undefined)} aria-label="Remove proof of payment" className="rounded p-1 text-muted hover:text-danger">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-line px-3 py-3 text-sm transition hover:border-brand/40">
              {uploading ? <Loader2 className="size-4 animate-spin text-brand" /> : <UploadCloud className="size-4 text-brand" />}
              <span className="font-bold">Attach proof of payment</span>
              <span className="text-xs text-muted">(optional · screenshot or PDF, max 5 MB)</span>
              <input
                id="payment-proof"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  if (!PROOF_TYPES.includes(f.type)) return setErrors((x) => ({ ...x, proof: "Use a PDF, JPG or PNG file." }));
                  if (f.size > PROOF_MAX) return setErrors((x) => ({ ...x, proof: "Files must be 5 MB or smaller." }));
                  setUploading(true);
                  try {
                    setProof(await saveFile(f));
                    setErrors((x) => ({ ...x, proof: "" }));
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
          )}
          {errors.proof && <p className="mt-1 text-xs font-bold text-danger">{errors.proof}</p>}
        </div>
      </div>

      <div>
        <p className="text-sm font-bold">3. Where should a refund go?</p>
        <p className="text-xs text-muted">Only used if we can&apos;t take your idea on.</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Input label="Account name" value={form.refundName} onChange={(v) => set("refundName", v)} error={errors.refundName} />
          <Input label="Account number" value={form.refundNumber} onChange={(v) => set("refundNumber", v.replace(/\D/g, "").slice(0, 10))} error={errors.refundNumber} inputMode="numeric" />
          <Input label="Bank" value={form.refundBank} onChange={(v) => set("refundBank", v)} error={errors.refundBank} />
        </div>
      </div>

      {errors.form && <p className="text-xs font-bold text-danger">{errors.form}</p>}
      <button type="button" onClick={claim} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-navy font-display text-sm font-semibold text-white transition hover:bg-navy-700">
        <Check className="size-4" /> I have sent the money
      </button>
    </div>
  );
}

/** Stand-in for Paystack's hosted checkout while the frontend runs on mock data. */
function PaystackCheckout({ amount, currency, email, reference, onDone }: { amount: number; currency: string; email: string; reference: string; onDone: (ok: boolean) => void }) {
  const [paying, setPaying] = useState(false);
  return (
    <motion.div className="fixed inset-0 z-[90] grid place-items-center bg-navy-950/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div role="dialog" aria-modal="true" aria-label="Paystack checkout" initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="font-display font-bold text-teal-700">paystack</span>
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase text-brand-700">Demo checkout</span>
        </div>
        <div className="p-5 text-center">
          <p className="text-xs text-muted">{email}</p>
          <p className="mt-1 font-display text-3xl font-bold">{formatPrice(amount, currency)}</p>
          <p className="mt-1 font-mono text-xs text-muted">{reference}</p>
          <p className="mt-4 rounded-xl bg-mist px-3 py-2 text-xs text-muted">On the live site this is Paystack&apos;s secure page. Our server confirms the payment with Paystack before your wallet updates.</p>
          <button
            type="button"
            disabled={paying}
            onClick={() => {
              setPaying(true);
              window.setTimeout(() => onDone(true), 900);
            }}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal font-bold text-white hover:bg-teal-700 disabled:opacity-70"
          >
            {paying ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} {paying ? "Confirming…" : `Pay ${formatPrice(amount, currency)}`}
          </button>
          <button type="button" disabled={paying} onClick={() => onDone(false)} className="mt-2 h-10 w-full rounded-xl text-sm font-bold text-muted hover:text-navy">
            Cancel payment
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatePill({ state }: { state: ReturnType<typeof feeState> }) {
  const meta = {
    UNPAID: ["Not funded", "bg-white/15 text-white"],
    PENDING: ["Not funded", "bg-white/15 text-white"],
    AWAITING_CONFIRMATION: ["Checking transfer", "bg-brand text-white"],
    PAID: ["Funded", "bg-teal text-white"],
  }[state];
  return <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", meta[1])}>{meta[0]}</span>;
}

function Banner({ tone, icon, title, children }: { tone: "good" | "wait" | "bad"; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      role="status"
      className={cn("flex gap-3 rounded-2xl p-4 text-sm", tone === "good" ? "bg-teal-soft text-teal-700" : tone === "wait" ? "bg-brand-soft text-brand-700" : "bg-danger-soft text-danger")}
    >
      <span className="shrink-0">{icon}</span>
      <span>
        <b className="block">{title}</b>
        <span className="text-navy/80">{children}</span>
      </span>
    </motion.div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => {});
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      aria-label={`Copy ${label.toLowerCase()}`}
      className="rounded-md p-1 text-muted hover:bg-white hover:text-navy"
    >
      {copied ? <Check className="size-3.5 text-teal" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function Input({ label, value, onChange, error, type = "text", placeholder, inputMode }: { label: string; value: string; onChange: (v: string) => void; error?: string; type?: string; placeholder?: string; inputMode?: "numeric" }) {
  return (
    <label className="block text-xs font-bold">
      {label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} aria-invalid={!!error} className={cn(input, "mt-1 font-normal", error && "border-danger/60")} />
      {error && <span className="mt-1 block text-danger">{error}</span>}
    </label>
  );
}
