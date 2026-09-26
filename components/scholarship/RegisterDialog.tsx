"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Building2, CheckCircle2, Copy, CreditCard, Loader2, Upload, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import {
  applyForScholarship,
  declareScholarshipTransfer,
  payScholarshipOnline,
  type Registration,
  type ScholarshipProgramme,
} from "@/lib/scholarship";
import { cn } from "@/lib/format";
import { money } from "./ScholarshipPage";

/** Nigeria's states, so the form is a choice rather than a spelling test. */
const STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo",
  "Ekiti", "Enugu", "FCT - Abuja", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
  "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
];

type Step = "details" | "pay" | "transfer" | "sent";

/** ?partner=ghessa — set when a partner's landing page sent them here. */
function partnerFromUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("partner") || undefined;
}

export function RegisterDialog({ programme, onClose }: { programme: ScholarshipProgramme; onClose: () => void }) {
  const [step, setStep] = useState<Step>("details");
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", state: "", nationality: "Nigerian", course: "" });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const detailsValid =
    form.name.trim().length > 2 &&
    /^\S+@\S+\.\S+$/.test(form.email.trim()) &&
    form.phone.replace(/\D/g, "").length >= 7 &&
    form.address.trim().length > 4 &&
    form.state !== "" &&
    form.nationality.trim().length > 1;

  const submitDetails = async () => {
    if (!detailsValid || busy) return;
    setBusy(true);
    setError("");
    try {
      setRegistration(await applyForScholarship({ ...form, course: form.course || undefined, partner: partnerFromUrl() }));
      setStep("pay");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const payOnline = async () => {
    if (!registration || busy) return;
    setBusy(true);
    setError("");
    try {
      const { authorizationUrl } = await payScholarshipOnline(registration.ref, registration.token);
      window.location.href = authorizationUrl;
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <motion.div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-navy-950/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scholarship-dialog-title"
        initial={{ y: 24, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 16, scale: 0.98 }}
        className="relative my-6 w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
      >
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full p-1.5 text-muted hover:bg-mist">
          <X className="size-5" />
        </button>

        {step === "details" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitDetails();
            }}
          >
            <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Step 1 of 2 · Your details</p>
            <h2 id="scholarship-dialog-title" className="mt-1 font-display text-xl font-bold text-navy">
              Apply for the scholarship
            </h2>
            <p className="mt-1 text-sm text-muted">
              The form fee is {money(programme.fee, programme.currency)}. We send your form and exam date to the email you enter here.
            </p>

            <div className="mt-4 space-y-3">
              <Field label="Full name" id="sch-name">
                <input id="sch-name" value={form.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" className={inputClass} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email" id="sch-email">
                  <input id="sch-email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" placeholder="you@example.com" className={inputClass} />
                </Field>
                <Field label="Phone number" id="sch-phone">
                  <input id="sch-phone" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" placeholder="0803 000 0000" className={inputClass} />
                </Field>
              </div>
              <Field label="Home address" id="sch-address">
                <input id="sch-address" value={form.address} onChange={(e) => set({ address: e.target.value })} autoComplete="street-address" placeholder="Street, area, town" className={inputClass} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="State" id="sch-state">
                  <select id="sch-state" value={form.state} onChange={(e) => set({ state: e.target.value })} className={inputClass}>
                    <option value="">Choose a state…</option>
                    {STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Nationality" id="sch-nationality">
                  <input id="sch-nationality" value={form.nationality} onChange={(e) => set({ nationality: e.target.value })} className={inputClass} />
                </Field>
              </div>
              {programme.courses.length > 0 && (
                <Field label="Course you want" id="sch-course" hint="You can change this at the centre.">
                  <select id="sch-course" value={form.course} onChange={(e) => set({ course: e.target.value })} className={inputClass}>
                    <option value="">Not sure yet</option>
                    {programme.courses.map((c) => (
                      <option key={c.title} value={c.title}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>

            <div aria-live="polite">{error && <p className="mt-3 text-sm font-bold text-danger">{error}</p>}</div>
            <button disabled={!detailsValid || busy} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand font-bold text-white transition hover:bg-brand-600 disabled:opacity-40">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Saving…" : "Continue to payment"} <ArrowRight className="size-4" />
            </button>
          </form>
        )}

        {step === "pay" && registration && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Step 2 of 2 · Form fee</p>
            <h2 className="mt-1 font-display text-xl font-bold text-navy">Pay {money(registration.amount, registration.currency)}</h2>
            <p className="mt-1 text-sm text-muted">
              Your reference is <span className="font-mono font-bold text-navy">{registration.ref}</span>. Keep it safe — it opens your form and exam
              details.
            </p>

            <div className="mt-4 space-y-3">
              {programme.checkout.paystack.enabled && (
                <button
                  onClick={() => void payOnline()}
                  disabled={busy}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line p-4 text-left transition hover:border-brand disabled:opacity-50"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-700">
                    {busy ? <Loader2 className="size-5 animate-spin" /> : <CreditCard className="size-5" />}
                  </span>
                  <span>
                    <span className="block font-bold text-navy">Pay online now</span>
                    <span className="block text-sm text-muted">Card, bank or USSD through Paystack. Your form unlocks straight away.</span>
                  </span>
                </button>
              )}
              {programme.checkout.manual.enabled && (
                <button
                  onClick={() => setStep("transfer")}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line p-4 text-left transition hover:border-brand"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-soft text-teal-700">
                    <Building2 className="size-5" />
                  </span>
                  <span>
                    <span className="block font-bold text-navy">Pay by bank transfer</span>
                    <span className="block text-sm text-muted">Transfer, upload your receipt, and we confirm it — usually within {programme.checkout.confirmationTime}.</span>
                  </span>
                </button>
              )}
            </div>

            <div aria-live="polite">{error && <p className="mt-3 text-sm font-bold text-danger">{error}</p>}</div>
            <a href={registration.statusLink} className="mt-4 block text-center text-xs text-muted underline-offset-4 hover:text-navy hover:underline">
              Save my place and pay later
            </a>
          </div>
        )}

        {step === "transfer" && registration && (
          <TransferStep
            programme={programme}
            registration={registration}
            onDone={() => setStep("sent")}
            onBack={() => setStep("pay")}
          />
        )}

        {step === "sent" && registration && (
          <div className="py-4 text-center">
            <CheckCircle2 className="mx-auto size-12 text-teal" />
            <h2 className="mt-3 font-display text-lg font-bold text-navy">Thanks, {registration.ref}</h2>
            <p className="mt-1 text-sm text-muted">
              We are checking your transfer. As soon as it is confirmed we email your application form and your exam date.
            </p>
            <a href={registration.statusLink} className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-navy px-5 font-bold text-white">
              Open my application
            </a>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function TransferStep({
  programme,
  registration,
  onDone,
  onBack,
}: {
  programme: ScholarshipProgramme;
  registration: Registration;
  onDone: () => void;
  onBack: () => void;
}) {
  const bank = programme.checkout.manual;
  const [senderName, setSenderName] = useState("");
  const [senderBank, setSenderBank] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [proof, setProof] = useState<File | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (senderName.trim().length < 2 || busy) return;
    setBusy(true);
    setError("");
    try {
      await declareScholarshipTransfer(registration.ref, registration.token, {
        senderName: senderName.trim(),
        senderBank: senderBank.trim() || undefined,
        transferDate: transferDate || undefined,
        proof,
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Bank transfer</p>
      <h2 className="mt-1 font-display text-xl font-bold text-navy">Send {money(registration.amount, registration.currency)}</h2>

      <dl className="mt-4 space-y-2 rounded-2xl bg-mist p-4 text-sm">
        <Row label="Bank" value={bank.bankName} />
        <Row label="Account name" value={bank.accountName} />
        <Row label="Account number" value={bank.accountNumber} copy />
        <Row label="Use as narration" value={registration.ref} copy />
      </dl>
      {bank.transferInstructions && <p className="mt-2 text-xs text-muted">{bank.transferInstructions}</p>}

      <div className="mt-4 space-y-3">
        <Field label="Name on the account you paid from" id="sch-sender">
          <input id="sch-sender" value={senderName} onChange={(e) => setSenderName(e.target.value)} className={inputClass} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Your bank" id="sch-sender-bank" hint="Optional">
            <input id="sch-sender-bank" value={senderBank} onChange={(e) => setSenderBank(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Date you paid" id="sch-transfer-date" hint="Optional">
            <input id="sch-transfer-date" type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div>
          <span className="block text-sm font-bold text-navy">Receipt or screenshot</span>
          <label
            htmlFor="sch-proof"
            className={cn(
              "mt-1.5 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line px-3 py-3 text-sm transition hover:border-brand",
              proof && "border-teal bg-teal-soft/40",
            )}
          >
            <Upload className="size-4 text-brand" />
            {proof ? proof.name : "Upload your receipt (PDF or image)"}
          </label>
          <input
            id="sch-proof"
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            onChange={(e) => setProof(e.target.files?.[0])}
          />
          <p className="mt-1 text-xs text-muted">It helps us confirm your payment quickly.</p>
        </div>
      </div>

      <div aria-live="polite">{error && <p className="mt-3 text-sm font-bold text-danger">{error}</p>}</div>
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onBack} className="h-12 rounded-xl border border-line px-4 font-bold text-navy">
          Back
        </button>
        <button disabled={senderName.trim().length < 2 || busy} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand font-bold text-white disabled:opacity-40">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? "Sending…" : "I have sent the money"}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "mt-1.5 h-11 w-full rounded-xl border border-line px-3.5 text-sm outline-none placeholder:text-muted/70 focus:border-brand focus:ring-4 focus:ring-brand/15";

function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-navy">
        {label} {hint && <span className="font-normal text-muted">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Row({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="flex items-center gap-1.5 font-bold text-navy">
        {value}
        {copy && (
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(value).catch(() => {})}
            aria-label={`Copy ${label}`}
            className="rounded p-1 text-muted hover:bg-white hover:text-navy"
          >
            <Copy className="size-3.5" />
          </button>
        )}
      </dd>
    </div>
  );
}
