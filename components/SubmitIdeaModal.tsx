"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, Lightbulb, Loader2, ShieldCheck, X } from "lucide-react";
import { BUDGETS, CATEGORIES, PLATFORMS, TIMELINES, type Idea, type IdeaInput } from "@/lib/ideas";
import { submitIdeaForm } from "@/lib/actions";
import { cn } from "@/lib/format";

const STEPS = ["About you", "Your idea", "Budget & timeline"];

type Errors = Partial<Record<keyof IdeaInput, string>>;

const EMPTY: IdeaInput = {
  name: "",
  email: "",
  phone: "",
  organisation: "",
  location: "",
  title: "",
  category: "",
  platforms: [],
  problem: "",
  targetUsers: "",
  features: "",
  budget: "",
  timeline: "",
  nda: true,
};

function validate(step: number, f: IdeaInput): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (f.name.trim().length < 2) e.name = "Please enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = "Enter a valid email so we can send your proposal.";
    if (f.phone.replace(/\D/g, "").length < 10) e.phone = "Enter a phone number we can call or text.";
    if (f.location.trim().length < 2) e.location = "Tell us your city or country.";
  }
  if (step === 1) {
    if (f.title.trim().length < 2) e.title = "Give your idea a working name.";
    if (!f.category) e.category = "Choose the closest category.";
    if (f.platforms.length === 0) e.platforms = "Pick at least one.";
    if (f.problem.trim().length < 15) e.problem = "Describe the problem in a sentence or two.";
    if (f.targetUsers.trim().length < 5) e.targetUsers = "Who will use it?";
    if (f.features.trim().length < 10) e.features = "List a few key things it should do.";
  }
  if (step === 2) {
    if (!f.budget) e.budget = "Choose a budget range. \"Not sure yet\" is fine.";
    if (!f.timeline) e.timeline = "Choose when you'd like it ready.";
  }
  return e;
}

export default function SubmitIdeaModal({ open, onClose, initialEmail }: { open: boolean; onClose: () => void; initialEmail?: string }) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [form, setForm] = useState<IdeaInput>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Idea | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setErrors({});
    setDone(null);
    setForm({ ...EMPTY, email: initialEmail ?? "" });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("input, textarea, select")?.focus(), 250);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, initialEmail, onClose]);

  const set = <K extends keyof IdeaInput>(key: K, value: IdeaInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const next = () => {
    const e = validate(step, form);
    setErrors(e);
    if (Object.keys(e).length) {
      dialogRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
      return;
    }
    if (step < STEPS.length - 1) {
      setDir(1);
      setStep((s) => s + 1);
      dialogRef.current?.querySelector(".modal-scroll")?.scrollTo({ top: 0 });
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      const idea = submitIdeaForm({ ...form, name: form.name.trim(), email: form.email.trim(), organisation: form.organisation?.trim() || undefined });
      setBusy(false);
      setDone(idea);
    }, 1100);
  };

  const back = () => {
    setDir(-1);
    setErrors({});
    setStep((s) => s - 1);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-navy-950/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="idea-title"
            initial={{ y: 60, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="relative flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
          >
            {/* header */}
            <div className="relative overflow-hidden bg-navy px-5 pb-5 pt-5 text-white sm:px-7">
              <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-navy-700/70 to-transparent" style={{ clipPath: "polygon(55% 0, 100% 0, 100% 100%)" }} />
              <svg aria-hidden className="absolute -right-16 -top-20 size-64" viewBox="0 0 260 260" fill="none">
                {[30, 55, 80, 105].map((r) => (
                  <circle key={r} cx="130" cy="130" r={r} stroke="rgba(160,190,230,0.16)" />
                ))}
              </svg>
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-brand">
                    <Lightbulb className="size-4" /> Submit your idea
                  </p>
                  <h2 id="idea-title" className="mt-1.5 font-display text-2xl font-bold">
                    {done ? "We've got your idea!" : "Tell us what you want to build"}
                  </h2>
                  {!done && <p className="mt-1 text-sm text-white/65">No technical knowledge needed. Takes about 3 minutes.</p>}
                </div>
                <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2 transition hover:bg-white/20">
                  <X className="size-5" />
                </button>
              </div>

              {!done && (
                <ol className="relative mt-5 grid grid-cols-3 gap-2">
                  {STEPS.map((s, i) => (
                    <li key={s}>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                        <motion.div className="h-full bg-brand" initial={false} animate={{ width: i <= step ? "100%" : "0%" }} transition={{ duration: 0.4 }} />
                      </div>
                      <p className={cn("mt-2 flex items-center gap-1.5 text-xs", i <= step ? "font-bold text-white" : "text-white/50")}>
                        <span className={cn("grid size-4 place-items-center rounded-full text-[9px]", i < step ? "bg-teal" : i === step ? "bg-brand" : "bg-white/15")}>
                          {i < step ? <Check className="size-2.5" strokeWidth={4} /> : i + 1}
                        </span>
                        <span className="truncate">{s}</span>
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* body */}
            <div className="modal-scroll flex-1 overflow-y-auto overflow-x-hidden">
              {done ? (
                <Success idea={done} onClose={onClose} />
              ) : (
                <AnimatePresence mode="wait" custom={dir} initial={false}>
                  <motion.div
                    key={step}
                    custom={dir}
                    initial={{ opacity: 0, x: dir * 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: dir * -40 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-4 p-5 sm:p-7"
                  >
                    {step === 0 && (
                      <>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Text label="Full name" id="name" value={form.name} onChange={(v) => set("name", v)} error={errors.name} autoComplete="name" placeholder="e.g. Ada Okafor" />
                          <Text label="Organisation" optional id="organisation" value={form.organisation ?? ""} onChange={(v) => set("organisation", v)} autoComplete="organization" placeholder="Business, NGO or school" />
                          <Text label="Email" id="email" type="email" value={form.email} onChange={(v) => set("email", v)} error={errors.email} autoComplete="email" placeholder="you@example.com" />
                          <Text label="Phone number" id="phone" type="tel" value={form.phone} onChange={(v) => set("phone", v)} error={errors.phone} autoComplete="tel" placeholder="+234 800 000 0000" />
                        </div>
                        <Text label="Location" id="location" value={form.location} onChange={(v) => set("location", v)} error={errors.location} autoComplete="address-level2" placeholder="City, country" />
                      </>
                    )}

                    {step === 1 && (
                      <>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Text label="Idea name" id="title" value={form.title} onChange={(v) => set("title", v)} error={errors.title} placeholder="A working name is fine" />
                          <Field label="Category" id="category" error={errors.category}>
                            <select
                              id="category"
                              value={form.category}
                              onChange={(e) => set("category", e.target.value)}
                              aria-invalid={!!errors.category}
                              className={inputClass(!!errors.category, "h-12")}
                            >
                              <option value="">Choose a category</option>
                              {CATEGORIES.map((c) => (
                                <option key={c}>{c}</option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        <Field label="What should we build?" id="platforms" error={errors.platforms}>
                          <div className="flex flex-wrap gap-2" role="group" aria-invalid={!!errors.platforms} tabIndex={-1}>
                            {PLATFORMS.map((p) => {
                              const on = form.platforms.includes(p);
                              return (
                                <button
                                  key={p}
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() => set("platforms", on ? form.platforms.filter((x) => x !== p) : [...form.platforms, p])}
                                  className={cn(
                                    "flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition",
                                    on ? "border-navy bg-navy text-white" : "border-line text-muted hover:border-navy/40 hover:text-navy",
                                  )}
                                >
                                  {on && <Check className="size-3.5" />} {p}
                                </button>
                              );
                            })}
                          </div>
                        </Field>
                        <Area label="What problem does it solve?" id="problem" value={form.problem} onChange={(v) => set("problem", v)} error={errors.problem} placeholder="e.g. Farmers can't reach buyers in the city, so they sell at very low prices." />
                        <Area label="Who will use it?" id="targetUsers" rows={2} value={form.targetUsers} onChange={(v) => set("targetUsers", v)} error={errors.targetUsers} placeholder="e.g. Smallholder farmers and restaurant owners in Lagos" />
                        <Area label="Key features" id="features" value={form.features} onChange={(v) => set("features", v)} error={errors.features} placeholder="e.g. List produce with photos, order and pay online, track delivery" />
                      </>
                    )}

                    {step === 2 && (
                      <>
                        <Choice label="Estimated budget" options={BUDGETS} value={form.budget} onChange={(v) => set("budget", v)} error={errors.budget} />
                        <Choice label="When do you need it?" options={TIMELINES} value={form.timeline} onChange={(v) => set("timeline", v)} error={errors.timeline} />
                        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-mist/60 p-4">
                          <input type="checkbox" checked={form.nda} onChange={(e) => set("nda", e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-brand)]" />
                          <span className="text-sm">
                            <span className="flex items-center gap-1.5 font-bold">
                              <ShieldCheck className="size-4 text-teal" /> Keep my idea confidential (NDA)
                            </span>
                            <span className="text-muted">We&apos;ll sign a non-disclosure agreement before discussing details.</span>
                          </span>
                        </label>
                        <div className="rounded-2xl border border-dashed border-line p-4 text-sm">
                          <p className="font-bold">Quick check</p>
                          <p className="mt-1 text-muted">
                            <b className="text-navy">{form.title}</b> · {form.category} · {form.platforms.join(", ")}
                            <br />
                            We&apos;ll contact <b className="text-navy">{form.name}</b> at {form.email}.
                          </p>
                        </div>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>

            {/* footer */}
            {!done && (
              <div className="flex items-center justify-between gap-3 border-t border-line bg-white px-5 py-4 sm:px-7">
                {step > 0 ? (
                  <button onClick={back} disabled={busy} className="flex items-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-bold text-muted hover:text-navy">
                    <ArrowLeft className="size-4" /> Back
                  </button>
                ) : (
                  <span className="text-xs text-muted">Step 1 of {STEPS.length}</span>
                )}
                <button
                  onClick={next}
                  disabled={busy}
                  className="group flex h-12 items-center gap-2 rounded-xl bg-brand px-6 font-display text-sm font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-600 disabled:opacity-70"
                >
                  {busy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Submitting…
                    </>
                  ) : step === STEPS.length - 1 ? (
                    <>
                      Submit idea <Check className="size-4" />
                    </>
                  ) : (
                    <>
                      Continue <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Success({ idea, onClose }: { idea: Idea; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="p-6 text-center sm:p-10">
      <motion.span
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 14 }}
        className="mx-auto grid size-20 place-items-center rounded-full bg-teal-soft"
      >
        <CheckCircle2 className="size-11 text-teal" />
      </motion.span>
      <p className="mt-5 text-muted">
        Thanks, {idea.name.split(" ")[0]}! Our team will review <b className="text-navy">{idea.title}</b> and send you a proposal and quote within <b className="text-navy">2 working days</b>.
      </p>
      <div className="mx-auto mt-5 flex max-w-xs items-center justify-between gap-3 rounded-2xl bg-mist px-4 py-3">
        <span className="text-left">
          <span className="block text-xs text-muted">Your reference</span>
          <span className="font-mono text-lg font-bold">{idea.ref}</span>
        </span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(idea.ref).catch(() => {});
            setCopied(true);
          }}
          className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold shadow-sm"
        >
          {copied ? <Check className="size-3.5 text-teal" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <ol className="mx-auto mt-6 max-w-sm space-y-3 text-left text-sm">
        {["We review your idea and pick the right tech stack.", "You get a proposal and quote by email.", "Once you accept, you receive your Project ID to track the build here."].map((t, i) => (
          <motion.li key={t} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.12 }} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-white">{i + 1}</span>
            <span className="text-navy/80">{t}</span>
          </motion.li>
        ))}
      </ol>
      <p className="mx-auto mt-5 max-w-sm rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand-700">
        Check your idea&apos;s status anytime: enter <b className="font-mono">{idea.ref}</b> in the tracker on the home page.
      </p>
      <button onClick={onClose} className="mt-6 h-12 w-full max-w-xs rounded-xl bg-navy font-bold text-white transition hover:bg-navy-700">
        Done
      </button>
    </div>
  );
}

function inputClass(error: boolean, extra = "") {
  return cn(
    "w-full rounded-xl border bg-white px-3.5 text-sm text-navy outline-none transition placeholder:text-muted/70 focus:ring-4",
    error ? "border-danger/60 focus:border-danger focus:ring-danger/15" : "border-line focus:border-brand focus:ring-brand/15",
    extra,
  );
}

function Field({ label, id, optional, error, children }: { label: string; id: string; optional?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">
        {label} {optional && <span className="font-normal text-muted">(optional)</span>}
      </label>
      {children}
      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} id={`${id}-error`} className="mt-1 text-xs font-bold text-danger">
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function Text({
  label,
  id,
  value,
  onChange,
  error,
  optional,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  optional?: boolean;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <Field label={label} id={id} optional={optional} error={error}>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass(!!error, "h-12")}
      />
    </Field>
  );
}

function Area({ label, id, value, onChange, error, placeholder, rows = 3 }: { label: string; id: string; value: string; onChange: (v: string) => void; error?: string; placeholder?: string; rows?: number }) {
  return (
    <Field label={label} id={id} error={error}>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass(!!error, "resize-none py-3 leading-relaxed")}
      />
    </Field>
  );
}

function Choice({ label, options, value, onChange, error }: { label: string; options: string[]; value: string; onChange: (v: string) => void; error?: string }) {
  const id = label.replace(/\W+/g, "-").toLowerCase();
  return (
    <Field label={label} id={id} error={error}>
      <div role="radiogroup" aria-label={label} aria-invalid={!!error} tabIndex={-1} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={cn(
              "rounded-xl border px-3 py-3 text-sm font-bold transition",
              value === o ? "border-brand bg-brand-soft text-brand-700 ring-2 ring-brand/30" : "border-line text-navy/80 hover:border-navy/40",
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </Field>
  );
}
