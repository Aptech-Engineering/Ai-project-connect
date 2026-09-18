"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Building2, Check, CheckCircle2, Clock, Copy, CreditCard, FileText, Landmark, Loader2, Lock, RefreshCw, ShieldCheck, UploadCloud, Wallet, X } from "lucide-react";
import { ApiError, errorMessage } from "@/lib/api";
import { track } from "@/lib/track";
import { formatPrice } from "@/lib/catalog";
import { formatBytes, validateProof } from "@/lib/files";
import { cn } from "@/lib/format";
import {
  checkoutFeeLabel,
  claimManualPayment,
  currentPayment,
  feeState,
  goToPaystack,
  lastFailedPayment,
  startPaystack,
  type Application,
  type FeeState,
  type PaymentOutcome,
} from "@/lib/wallet";
import WalletLedger from "./WalletLedger";

/** What Paystack put in the address bar when it sent the payer back to /apply. */
export interface PaystackReturn {
  outcome: PaymentOutcome;
  reference: string | null;
  ref: string | null;
}

const input =
  "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-navy outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-4 focus:ring-brand/15";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/**
 * The commitment fee step of the idea application.
 *
 * Everything shown here comes from `application.checkout`, which the API sends with
 * the application itself — a client has no admin session, so the fee, the bank details
 * and the wording can't come from the settings endpoint. Nothing in this component can
 * mark a payment as paid: online payments leave for Paystack's own page and come back
 * verified, and a bank transfer waits for an admin to confirm it.
 */
export default function WalletStep({
  application,
  token,
  paystackReturn,
  onRefresh,
}: {
  application: Application;
  token: string;
  paystackReturn?: PaystackReturn | null;
  onRefresh?: () => void;
}) {
  const { checkout } = application;
  const state = feeState(application);
  const payment = currentPayment(application);
  const failed = lastFailedPayment(application);
  const fee = checkoutFeeLabel(checkout);
  const [method, setMethod] = useState<"paystack" | "manual">(checkout.paystack.enabled ? "paystack" : "manual");
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");

  const canPay = state === "UNPAID" || state === "PENDING" || state === "FAILED";
  const methods = ([["paystack", CreditCard, "Pay online", checkout.paystack.enabled], ["manual", Landmark, "Bank transfer", checkout.manual.enabled]] as const).filter(
    ([, , , on]) => on,
  );
  const funded = state === "PAID" ? (payment?.amount ?? checkout.fee) : 0;

  const payOnline = async () => {
    if (leaving) return;
    setLeaving(true);
    setError("");
    try {
      // The browser really leaves the site here; Paystack sends it back to /apply.
      const checkout = await startPaystack(token);
      track("payment", "started", { method: "paystack", step: "started" });
      goToPaystack(checkout);
    } catch (e) {
      setError(errorMessage(e));
      setLeaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-bold">{checkout.feeTitle}</h3>

      {paystackReturn && <ReturnBanner result={paystackReturn} state={state} />}

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
              <Wallet className="size-4 text-brand" /> Project wallet · {application.ref}
            </p>
            <p className="mt-2 font-display text-3xl font-bold">
              {formatPrice(funded, checkout.currency)}
              <span className="ml-2 text-base font-normal text-white/55">of {fee}</span>
            </p>
          </div>
          <StatePill state={state} />
        </div>
        <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/15">
          <motion.div
            className="h-full rounded-full bg-teal"
            initial={false}
            animate={{ width: state === "PAID" ? "100%" : state === "AWAITING_CONFIRMATION" ? "60%" : "0%" }}
            transition={{ duration: 0.6 }}
          />
        </div>
        <p className="relative mt-3 text-sm text-white/70">{checkout.feeExplainer}</p>
      </div>

      <div aria-live="polite">
        {state === "PAID" && (
          <Banner tone="good" icon={<CheckCircle2 className="size-5" />} title="Your wallet is funded">
            {payment?.receiptNo ? (
              <>
                Receipt <b className="font-mono">{payment.receiptNo}</b> is in your email. You can submit your idea now.
              </>
            ) : (
              <>Your receipt is on its way by email. You can submit your idea now.</>
            )}
          </Banner>
        )}
        {state === "AWAITING_CONFIRMATION" && (
          <Banner tone="wait" icon={<Clock className="size-5" />} title="We're checking your transfer">
            You can submit your idea now. Our team confirms transfers within {checkout.confirmationTime}, and your idea is approved only after that.
          </Banner>
        )}
        {state === "PENDING" && (
          <Banner tone="wait" icon={<Clock className="size-5" />} title="Your online payment hasn't completed yet">
            We only mark the fee as paid once Paystack confirms it. If you finished paying, give it a moment and check again.
            {onRefresh && (
              <button type="button" onClick={onRefresh} className="mt-2 flex items-center gap-1.5 text-xs font-bold text-brand-700 underline underline-offset-2">
                <RefreshCw className="size-3.5" /> Check again
              </button>
            )}
          </Banner>
        )}
        {state === "FAILED" && (
          <Banner tone="bad" icon={<AlertTriangle className="size-5" />} title="Your last payment didn't go through">
            {failed?.failureReason ?? "Paystack couldn't complete that payment."} Please try again.
          </Banner>
        )}
      </div>

      {canPay &&
        (methods.length === 0 ? (
          <p className="rounded-2xl bg-mist px-4 py-3 text-sm text-muted">
            Payments are switched off right now. Please email us and we&apos;ll take your commitment fee another way.
          </p>
        ) : (
          <>
            {methods.length > 1 && (
              <div role="tablist" aria-label="Payment method" className="grid grid-cols-2 gap-2 rounded-2xl bg-mist p-1">
                {methods.map(([key, Icon, label]) => (
                  <button
                    key={key}
                    role="tab"
                    type="button"
                    aria-selected={method === key}
                    onClick={() => setMethod(key)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition",
                      method === key ? "bg-white text-navy shadow-sm" : "text-muted hover:text-navy",
                    )}
                  >
                    <Icon className="size-4" /> {label}
                  </button>
                ))}
              </div>
            )}

            {method === "paystack" && checkout.paystack.enabled ? (
              <div className="rounded-2xl border border-line p-4">
                <p className="text-sm text-muted">
                  Pay with your card, bank app, USSD or bank transfer on Paystack&apos;s own page. We&apos;ll bring you straight back here, and your wallet
                  updates as soon as Paystack confirms the payment.
                </p>
                <p aria-live="polite">{error && <span className="mt-2 block text-xs font-bold text-danger">{error}</span>}</p>
                <button
                  type="button"
                  data-track="apply_pay_paystack"
                  onClick={payOnline}
                  disabled={leaving}
                  className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal font-display text-sm font-semibold text-white shadow-lg shadow-teal/20 transition hover:bg-teal-700 disabled:opacity-60 disabled:shadow-none"
                >
                  {leaving ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} {leaving ? "Taking you to Paystack…" : `Pay ${fee} with Paystack`}
                </button>
                <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted">
                  <ShieldCheck className="size-3.5 text-teal" /> Secured by Paystack
                  {checkout.paystack.mode === "test" && " · test mode"}. We never see your card details.
                </p>
              </div>
            ) : (
              <ManualTransfer application={application} token={token} fee={fee} />
            )}
          </>
        ))}

      {application.wallet.some((e) => e.type !== "fee") && <WalletLedger entries={application.wallet} compact />}
    </div>
  );
}

/** What the address bar said when Paystack sent them back. The server is still the source of truth. */
function ReturnBanner({ result, state }: { result: PaystackReturn; state: FeeState }) {
  const agrees = result.outcome === "success" ? state === "PAID" : result.outcome === "failed" ? state === "FAILED" : true;
  const text =
    result.outcome === "success"
      ? agrees
        ? "Paystack confirmed your payment. Your wallet is funded."
        : "Paystack says your payment went through. We're waiting for its confirmation to reach us — your wallet below shows where it stands."
      : result.outcome === "pending"
        ? "Paystack is still processing your payment. Your wallet below updates as soon as it confirms."
        : "That payment didn't go through, so nothing has been taken from your account. You can try again below.";
  return (
    <Banner
      tone={result.outcome === "success" ? "good" : result.outcome === "pending" ? "wait" : "bad"}
      icon={result.outcome === "success" ? <CheckCircle2 className="size-5" /> : result.outcome === "pending" ? <Clock className="size-5" /> : <AlertTriangle className="size-5" />}
      title="You're back from Paystack"
    >
      {text}
      {result.reference && (
        <span className="mt-1 block font-mono text-xs opacity-80">{result.reference}</span>
      )}
    </Banner>
  );
}

type ClaimForm = {
  senderName: string;
  senderBank: string;
  amount: string;
  transferDate: string;
  refundAccountName: string;
  refundAccountNumber: string;
  refundBank: string;
};

/** "I have sent the money": the fee waits for an admin to confirm the transfer. */
function ManualTransfer({ application, token, fee }: { application: Application; token: string; fee: string }) {
  const { checkout, fields, payment } = application;
  const [form, setForm] = useState<ClaimForm>({
    senderName: fields.name ?? "",
    senderBank: "",
    amount: String(checkout.fee),
    transferDate: today(),
    refundAccountName: payment.refundAccount?.accountName ?? fields.name ?? "",
    refundAccountNumber: payment.refundAccount?.accountNumber ?? "",
    refundBank: payment.refundAccount?.bankName ?? "",
  });
  const [proof, setProof] = useState<File | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const set = (k: keyof ClaimForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "", form: "" }));
  };

  const check = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (form.senderName.trim().length < 2) e.senderName = "Whose account did it come from?";
    if (form.senderBank.trim().length < 2) e.senderBank = "Which bank or app did you send it from?";
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) e.amount = "Enter the amount you transferred.";
    else if (amount < checkout.fee) e.amount = `The commitment fee is ${fee}. Please transfer the full amount.`;
    if (!form.transferDate || form.transferDate > today() || form.transferDate < daysAgo(60)) e.transferDate = "Enter the date you made the transfer.";
    if (form.refundAccountName.trim().length < 2) e.refundAccountName = "Enter the account name.";
    if (!/^\d{10}$/.test(form.refundAccountNumber.trim())) e.refundAccountNumber = "Enter the 10-digit account number.";
    if (form.refundBank.trim().length < 2) e.refundBank = "Enter the bank name.";
    return e;
  };

  const focusFirstError = () => {
    window.setTimeout(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(), 0);
  };

  const claim = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found = check();
    if (Object.keys(found).length) {
      setErrors(found);
      focusFirstError();
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await claimManualPayment(token, {
        senderName: form.senderName.trim(),
        senderBank: form.senderBank.trim(),
        amount: Number(form.amount),
        transferDate: form.transferDate,
        refundAccountName: form.refundAccountName.trim(),
        refundAccountNumber: form.refundAccountNumber.trim(),
        refundBank: form.refundBank.trim(),
        proof,
      });
      track("payment", "transfer_reported", { method: "manual", step: "transfer_reported" });
      // The response is the new application, so the screen above re-renders itself.
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.errors).length) {
        setErrors(e.errors);
        focusFirstError();
      } else {
        setErrors({ form: errorMessage(e) });
      }
    } finally {
      setBusy(false);
    }
  };

  const pickProof = (file: File | undefined) => {
    if (!file) return;
    const problem = validateProof(file);
    if (problem) {
      setErrors((e) => ({ ...e, proof: problem }));
      return;
    }
    setProof(file);
    setErrors((e) => ({ ...e, proof: "" }));
  };

  const rows: [string, string][] = [
    ["Bank", checkout.manual.bankName],
    ["Account name", checkout.manual.accountName],
    ["Account number", checkout.manual.accountNumber],
    ["Amount", fee],
    ["Narration", application.ref],
  ];

  return (
    <form ref={formRef} onSubmit={claim} noValidate className="space-y-4 rounded-2xl border border-line p-4">
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
        <p className="mt-2 text-xs text-muted">{checkout.manual.transferInstructions}</p>
      </div>

      <div>
        <p className="text-sm font-bold">2. Tell us about your transfer</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Input id="sender-name" label="Sender's name" value={form.senderName} onChange={(v) => set("senderName", v)} error={errors.senderName} />
          <Input id="sender-bank" label="Bank or app" value={form.senderBank} onChange={(v) => set("senderBank", v)} error={errors.senderBank} placeholder="e.g. GTBank, Opay" />
          <Input
            id="transfer-amount"
            label="Amount you sent"
            value={form.amount}
            onChange={(v) => set("amount", v.replace(/[^\d.]/g, ""))}
            error={errors.amount}
            inputMode="decimal"
            hint={`In ${checkout.currency}`}
          />
          <Input id="transfer-date" label="Date sent" type="date" value={form.transferDate} onChange={(v) => set("transferDate", v)} error={errors.transferDate} max={today()} min={daysAgo(60)} />
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
            <label htmlFor="payment-proof" className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-line px-3 py-3 text-sm transition hover:border-brand/40">
              <UploadCloud className="size-4 text-brand" />
              <span className="font-bold">Attach proof of payment</span>
              <span className="text-xs text-muted">(optional · screenshot or PDF, max 5 MB)</span>
              <input
                id="payment-proof"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="sr-only"
                onChange={(e) => {
                  pickProof(e.target.files?.[0]);
                  e.target.value = "";
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
          <Input id="refund-name" label="Account name" value={form.refundAccountName} onChange={(v) => set("refundAccountName", v)} error={errors.refundAccountName} />
          <Input
            id="refund-number"
            label="Account number"
            value={form.refundAccountNumber}
            onChange={(v) => set("refundAccountNumber", v.replace(/\D/g, "").slice(0, 10))}
            error={errors.refundAccountNumber}
            inputMode="numeric"
          />
          <Input id="refund-bank" label="Bank" value={form.refundBank} onChange={(v) => set("refundBank", v)} error={errors.refundBank} />
        </div>
      </div>

      <p aria-live="polite">{errors.form && <span className="block text-xs font-bold text-danger">{errors.form}</span>}</p>
      <button
        type="submit"
        data-track="apply_pay_transfer"
        disabled={busy}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-navy font-display text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {busy ? "Sending your details…" : "I have sent the money"}
      </button>
    </form>
  );
}

function StatePill({ state }: { state: FeeState }) {
  const meta: Record<FeeState, [string, string]> = {
    UNPAID: ["Not funded", "bg-white/15 text-white"],
    PENDING: ["Payment started", "bg-white/15 text-white"],
    FAILED: ["Payment failed", "bg-danger text-white"],
    AWAITING_CONFIRMATION: ["Checking transfer", "bg-brand text-white"],
    PAID: ["Funded", "bg-teal text-white"],
  };
  const [label, className] = meta[state];
  return <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", className)}>{label}</span>;
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

function Input({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  type = "text",
  placeholder,
  inputMode,
  min,
  max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  placeholder?: string;
  inputMode?: "numeric" | "decimal";
  min?: string;
  max?: string;
}) {
  return (
    <div className="text-xs font-bold">
      <label htmlFor={id}>
        {label} {hint && <span className="font-normal text-muted">({hint})</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        min={min}
        max={max}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(input, "mt-1 font-normal", error && "border-danger/60")}
      />
      {error && (
        <span id={`${id}-error`} className="mt-1 block text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
