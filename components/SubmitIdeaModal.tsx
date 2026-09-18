"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock, Copy, FileText, History, Lightbulb, Link2, Loader2, Mail, Save, ShieldCheck, UploadCloud, X } from "lucide-react";
import { IDEA_STATUSES, useIdeas, type Idea } from "@/lib/ideas";
import { useSiteContent } from "@/lib/content";
import { cn, relativeDay } from "@/lib/format";
import { COUNTRIES, OTHER_COUNTRY, findCountry } from "@/lib/locations";
import { deleteFile, formatBytes, saveFile, validatePdf } from "@/lib/files";
import {
  createDraft,
  currentPayment,
  emailResumeLinks,
  feeLabel,
  feeState,
  findDraft,
  forgetDraft,
  rememberDraft,
  rememberedDraft,
  resumeLink,
  saveDraft,
  submitDraft,
  type DraftFields,
} from "@/lib/wallet";
import WalletStep from "./wallet/WalletStep";
import WalletLedger from "./wallet/WalletLedger";

const STEPS = ["About you", "Your idea", "Budget & timeline", "Fund wallet"];
const WALLET_STEP = 3;

type FormState = Omit<DraftFields, "location"> & { customCountry: string };
type Errors = Partial<Record<keyof FormState | "form", string>>;
type View = "form" | "resume" | "saved" | "done" | "submitted" | "invalid";

const EMPTY: FormState = {
  name: "",
  email: "",
  phone: "",
  organisation: "",
  country: "",
  state: "",
  customCountry: "",
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

function validate(step: number, f: FormState): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (f.name.trim().length < 2) e.name = "Please enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = "Enter a valid email so we can send your proposal.";
    if (f.phone.replace(/\D/g, "").length < 10) e.phone = "Enter a phone number we can call or text.";
    if (!f.country) e.country = "Choose your country.";
    else if (f.country === OTHER_COUNTRY && f.customCountry.trim().length < 2) e.customCountry = "Enter your country.";
    if (f.country && !f.state?.trim()) e.state = `Choose your ${(findCountry(f.country)?.regionLabel ?? "state / region").toLowerCase()}.`;
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

/** Turns a saved draft back into form state. */
function formFrom(idea: Idea): FormState {
  const known = !idea.country || COUNTRIES.some((c) => c.name === idea.country);
  return {
    name: idea.name,
    email: idea.email,
    phone: idea.phone,
    organisation: idea.organisation ?? "",
    country: known ? (idea.country ?? "") : OTHER_COUNTRY,
    customCountry: known ? "" : (idea.country ?? ""),
    state: idea.state ?? "",
    title: idea.title,
    category: idea.category,
    platforms: idea.platforms,
    problem: idea.problem,
    targetUsers: idea.targetUsers,
    features: idea.features,
    budget: idea.budget,
    timeline: idea.timeline,
    nda: idea.nda,
    attachment: idea.attachment,
  };
}

function fieldsFrom(f: FormState): DraftFields {
  const { customCountry, ...rest } = f;
  return {
    ...rest,
    name: f.name.trim(),
    email: f.email.trim(),
    organisation: f.organisation?.trim() || undefined,
    country: f.country === OTHER_COUNTRY ? customCountry.trim() : f.country,
    state: f.state?.trim(),
  };
}

export default function SubmitIdeaModal({ open, onClose, initialEmail, resumeToken }: { open: boolean; onClose: () => void; initialEmail?: string; resumeToken?: string | null }) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("form");
  const [token, setToken] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<Idea | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { ideaForm } = useSiteContent();
  const ideas = useIdeas();
  const idea = token ? ideas.find((i) => i.draftToken === token) : undefined;
  const closeRef = useRef(onClose);

  const load = (d: Idea) => {
    setForm(formFrom(d));
    setToken(d.draftToken!);
    rememberDraft(d.draftToken!);
    setStep(Math.min(d.draftStep ?? 0, WALLET_STEP));
    setErrors({});
    setView("form");
  };

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setErrors({});
    setToken(null);
    setWaiting(null);
    setForm({ ...EMPTY, email: initialEmail ?? "" });
    if (resumeToken) {
      const d = findDraft(resumeToken);
      if (!d) setView("invalid");
      else if (d.status !== "DRAFT") {
        setToken(resumeToken);
        setView("submitted");
      } else load(d);
    } else {
      const saved = rememberedDraft();
      if (saved) {
        setWaiting(saved);
        setView("resume");
      } else setView("form");
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("input, textarea, select")?.focus(), 250);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, initialEmail, resumeToken]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  /** Saves progress on the server. The first save creates the draft and emails the continue link. */
  const persist = (atStep: number): string => {
    let t = token;
    if (t) saveDraft(t, fieldsFrom(form), atStep);
    else {
      const d = createDraft(fieldsFrom(form), atStep);
      t = d.draftToken!;
      setToken(t);
      rememberDraft(t);
    }
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
    return t;
  };

  const goTo = (nextStep: number) => {
    setDir(nextStep > step ? 1 : -1);
    setStep(nextStep);
    dialogRef.current?.querySelector(".modal-scroll")?.scrollTo({ top: 0 });
  };

  const next = () => {
    if (step < WALLET_STEP) {
      const e = validate(step, form);
      setErrors(e);
      if (Object.keys(e).length) {
        window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(), 0);
        return;
      }
      persist(step + 1);
      goTo(step + 1);
      return;
    }
    if (!token) return;
    // Catch anything left incomplete in earlier steps.
    for (let s = 0; s < WALLET_STEP; s++) {
      const e = validate(s, form);
      if (Object.keys(e).length) {
        setErrors(e);
        goTo(s);
        return;
      }
    }
    setBusy(true);
    window.setTimeout(() => {
      saveDraft(token, fieldsFrom(form), WALLET_STEP);
      const result = submitDraft(token);
      setBusy(false);
      if (!result.ok) return setErrors({ form: result.error });
      setView("done");
    }, 900);
  };

  const saveForLater = () => {
    const e = validate(0, form);
    if (Object.keys(e).length) {
      setErrors(e);
      goTo(0);
      return;
    }
    persist(step);
    setView("saved");
  };

  const attach = async (file: File | undefined) => {
    if (!file || uploading) return;
    const problem = await validatePdf(file);
    if (problem) {
      setErrors((e) => ({ ...e, attachment: problem }));
      return;
    }
    setUploading(true);
    try {
      if (form.attachment) deleteFile(form.attachment.id).catch(() => {});
      const meta = await saveFile(file);
      set("attachment", meta);
    } catch {
      setErrors((e) => ({ ...e, attachment: "Upload failed. Please try again." }));
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = () => {
    if (form.attachment) deleteFile(form.attachment.id).catch(() => {});
    set("attachment", undefined);
  };

  const close = () => {
    // A file uploaded before anything was saved has nothing pointing at it.
    if (!token && form.attachment) deleteFile(form.attachment.id).catch(() => {});
    // Keep progress when the client closes mid-way.
    if (token && view === "form" && idea?.status === "DRAFT") saveDraft(token, fieldsFrom(form), step);
    onClose();
  };

  closeRef.current = close;

  const back = () => {
    setErrors({});
    if (token) persist(step - 1);
    goTo(step - 1);
  };

  const startFresh = () => {
    forgetDraft();
    setWaiting(null);
    setToken(null);
    setForm({ ...EMPTY, email: initialEmail ?? "" });
    setStep(0);
    setView("form");
  };

  const fee = feeLabel();
  const state = idea ? feeState(idea) : "UNPAID";
  const canSubmit = state === "PAID" || state === "AWAITING_CONFIRMATION";
  const title = { form: "Tell us what you want to build", resume: "Welcome back", saved: "Your application is saved", done: "We've got your idea!", submitted: "Your application", invalid: "This link doesn't work" }[view];

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-navy-950/70 backdrop-blur-sm" onClick={close} />
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
                    {title}
                  </h2>
                  {view === "form" && <p className="mt-1 text-sm text-white/65">{ideaForm.intro}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <AnimatePresence>
                    {savedFlash && (
                      <motion.span initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="status" className="flex items-center gap-1 rounded-full bg-teal/20 px-2.5 py-1 text-xs font-bold text-teal-soft">
                        <Check className="size-3.5" /> Saved
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <button onClick={close} aria-label="Close" className="rounded-full bg-white/10 p-2 transition hover:bg-white/20">
                    <X className="size-5" />
                  </button>
                </div>
              </div>

              {view === "form" && (
                <ol className="relative mt-5 grid grid-cols-4 gap-2">
                  {STEPS.map((s, i) => (
                    <li key={s}>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                        <motion.div className="h-full bg-brand" initial={false} animate={{ width: i <= step ? "100%" : "0%" }} transition={{ duration: 0.4 }} />
                      </div>
                      <p className={cn("mt-2 flex items-center gap-1.5 text-xs", i <= step ? "font-bold text-white" : "text-white/50")}>
                        <span className={cn("grid size-4 shrink-0 place-items-center rounded-full text-[9px]", i < step ? "bg-teal" : i === step ? "bg-brand" : "bg-white/15")}>
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
              {view === "done" && idea ? (
                <Success idea={idea} onClose={close} responseTime={ideaForm.responseTime} />
              ) : view === "resume" && waiting ? (
                <div className="p-6 text-center sm:p-10">
                  <span className="mx-auto grid size-16 place-items-center rounded-full bg-brand-soft">
                    <History className="size-8 text-brand" />
                  </span>
                  <p className="mt-4 text-muted">You have an unfinished application saved {relativeDay(waiting.lastSavedAt ?? waiting.submittedAt).toLowerCase()}.</p>
                  <div className="mx-auto mt-4 max-w-sm rounded-2xl border border-line p-4 text-left">
                    <p className="font-display font-semibold">{waiting.title || "Untitled idea"}</p>
                    <p className="text-xs text-muted">
                      {waiting.ref} · stopped at {STEPS[Math.min(waiting.draftStep ?? 0, WALLET_STEP)]} · {feeState(waiting) === "PAID" ? "wallet funded" : `${fee} fee not paid yet`}
                    </p>
                  </div>
                  <div className="mx-auto mt-6 flex max-w-sm flex-col gap-2 sm:flex-row">
                    <button onClick={startFresh} className="h-12 flex-1 rounded-xl border border-line font-bold text-muted hover:text-navy">
                      Start a new idea
                    </button>
                    <button onClick={() => load(waiting)} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand font-bold text-white hover:bg-brand-600">
                      Continue <ArrowRight className="size-4" />
                    </button>
                  </div>
                </div>
              ) : view === "saved" && idea ? (
                <div className="p-6 text-center sm:p-10">
                  <span className="mx-auto grid size-16 place-items-center rounded-full bg-teal-soft">
                    <Save className="size-8 text-teal" />
                  </span>
                  <p className="mt-4 text-muted">
                    Close this page anytime. We emailed a link to <b className="text-navy">{idea.email}</b> so you can continue from any device. This browser also remembers where you stopped.
                  </p>
                  <DemoLink href={resumeLink(idea)!} />
                  <button onClick={close} className="mt-6 h-12 w-full max-w-xs rounded-xl bg-navy font-bold text-white hover:bg-navy-700">
                    Done
                  </button>
                </div>
              ) : view === "submitted" && idea ? (
                <div className="space-y-4 p-5 sm:p-7">
                  <div className="flex items-start justify-between gap-3 rounded-2xl bg-mist p-4">
                    <div>
                      <p className="font-mono text-xs text-muted">{idea.ref}</p>
                      <p className="font-display text-lg font-bold">{idea.title}</p>
                      <p className="text-xs text-muted">Submitted {relativeDay(idea.submittedAt).toLowerCase()}</p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", IDEA_STATUSES[idea.status].className)}>{IDEA_STATUSES[idea.status].label}</span>
                  </div>
                  <WalletLedger idea={idea} />
                  {idea.projectCode && (
                    <p className="rounded-xl bg-teal-soft px-4 py-3 text-sm text-teal-700">
                      Your project is registered. Track it with Project ID <b className="font-mono">{idea.projectCode}</b>.
                    </p>
                  )}
                </div>
              ) : view === "invalid" ? (
                <div className="p-6 text-center sm:p-10">
                  <p className="text-muted">The link may be old or mistyped. Enter your email on the first step and we&apos;ll send a fresh one.</p>
                  <button onClick={startFresh} className="mt-6 h-12 w-full max-w-xs rounded-xl bg-brand font-bold text-white hover:bg-brand-600">
                    Go to the form
                  </button>
                </div>
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
                        {idea?.startedBy && (
                          <p className="rounded-xl bg-blue-soft px-4 py-3 text-sm">
                            <b>{idea.startedBy}</b> started this application with you at our centre. Check your details, add what&apos;s missing, then fund your wallet.
                          </p>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Text label="Full name" id="name" value={form.name} onChange={(v) => set("name", v)} error={errors.name} autoComplete="name" placeholder="e.g. Ada Okafor" />
                          <Text label="Organisation" optional id="organisation" value={form.organisation ?? ""} onChange={(v) => set("organisation", v)} autoComplete="organization" placeholder="Business, NGO or school" />
                          <Text label="Email" id="email" type="email" value={form.email} onChange={(v) => set("email", v)} error={errors.email} autoComplete="email" placeholder="you@example.com" />
                          <Text label="Phone number" id="phone" type="tel" value={form.phone} onChange={(v) => set("phone", v)} error={errors.phone} autoComplete="tel" placeholder="+234 800 000 0000" />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Country" id="country" error={errors.country}>
                            <select
                              id="country"
                              value={form.country}
                              onChange={(e) => {
                                set("country", e.target.value);
                                set("state", "");
                              }}
                              aria-invalid={!!errors.country}
                              autoComplete="country-name"
                              className={inputClass(!!errors.country, "h-12")}
                            >
                              <option value="">Select country</option>
                              {COUNTRIES.map((c) => (
                                <option key={c.name}>{c.name}</option>
                              ))}
                              <option value={OTHER_COUNTRY}>Other country</option>
                            </select>
                          </Field>
                          {(() => {
                            const country = findCountry(form.country ?? "");
                            const label = country?.regionLabel ?? "State / region";
                            return country ? (
                              <Field label={label} id="state" error={errors.state}>
                                <select
                                  id="state"
                                  value={form.state}
                                  onChange={(e) => set("state", e.target.value)}
                                  aria-invalid={!!errors.state}
                                  className={inputClass(!!errors.state, "h-12")}
                                >
                                  <option value="">Select {label.toLowerCase()}</option>
                                  {country.regions.map((r) => (
                                    <option key={r}>{r}</option>
                                  ))}
                                </select>
                              </Field>
                            ) : (
                              <Field label={label} id="state" error={errors.state}>
                                <input
                                  id="state"
                                  value={form.state}
                                  onChange={(e) => set("state", e.target.value)}
                                  disabled={!form.country}
                                  aria-invalid={!!errors.state}
                                  autoComplete="address-level1"
                                  placeholder={form.country ? "Enter your state or region" : "Select a country first"}
                                  className={inputClass(!!errors.state, "h-12 disabled:bg-mist disabled:text-muted")}
                                />
                              </Field>
                            );
                          })()}
                        </div>
                        {form.country === OTHER_COUNTRY && (
                          <Text label="Country name" id="customCountry" value={form.customCountry} onChange={(v) => set("customCountry", v)} error={errors.customCountry} autoComplete="country-name" placeholder="e.g. Zambia" />
                        )}
                        {!token && <ContinueLater />}
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
                              {ideaForm.categories.map((c) => (
                                <option key={c}>{c}</option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        <Field label="What should we build?" id="platforms" error={errors.platforms}>
                          <div className="flex flex-wrap gap-2" role="group" aria-invalid={!!errors.platforms} tabIndex={-1}>
                            {ideaForm.platforms.map((p) => {
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
                        <Field label="Project document" optional id="attachment" error={errors.attachment}>
                          {form.attachment ? (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.97 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="flex items-center gap-3 rounded-xl border border-teal/40 bg-teal-soft/60 p-3"
                            >
                              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-white text-danger shadow-sm">
                                <FileText className="size-5" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold">{form.attachment.name}</span>
                                <span className="flex items-center gap-1 text-xs text-teal-700">
                                  <CheckCircle2 className="size-3.5" /> Uploaded · {formatBytes(form.attachment.size)}
                                </span>
                              </span>
                              <button type="button" onClick={removeAttachment} aria-label="Remove document" className="rounded-lg p-2 text-muted transition hover:bg-white hover:text-danger">
                                <X className="size-4" />
                              </button>
                            </motion.div>
                          ) : (
                            <label
                              htmlFor="attachment"
                              onDragOver={(e) => {
                                e.preventDefault();
                                setDragOver(true);
                              }}
                              onDragLeave={() => setDragOver(false)}
                              onDrop={(e) => {
                                e.preventDefault();
                                setDragOver(false);
                                attach(e.dataTransfer.files?.[0]);
                              }}
                              className={cn(
                                "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition",
                                dragOver ? "border-brand bg-brand-soft/50" : errors.attachment ? "border-danger/50 bg-danger-soft/30" : "border-line hover:border-brand/50 hover:bg-mist/60",
                              )}
                            >
                              {uploading ? (
                                <Loader2 className="size-7 animate-spin text-brand" />
                              ) : (
                                <motion.span animate={dragOver ? { y: -4, scale: 1.1 } : { y: 0, scale: 1 }}>
                                  <UploadCloud className="size-7 text-brand" />
                                </motion.span>
                              )}
                              <span className="text-sm font-bold">{uploading ? "Uploading…" : "Drop your PDF here or click to browse"}</span>
                              <span className="text-xs text-muted">Business plan, brief or sketches · PDF only · max 10 MB</span>
                              <input
                                id="attachment"
                                type="file"
                                accept="application/pdf,.pdf"
                                className="sr-only"
                                onChange={(e) => {
                                  attach(e.target.files?.[0]);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          )}
                        </Field>
                      </>
                    )}

                    {step === 2 && (
                      <>
                        <Choice label="Estimated budget" options={ideaForm.budgets} value={form.budget} onChange={(v) => set("budget", v)} error={errors.budget} />
                        <Choice label="When do you need it?" options={ideaForm.timelines} value={form.timeline} onChange={(v) => set("timeline", v)} error={errors.timeline} />
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
                            {form.state}, {form.country === OTHER_COUNTRY ? form.customCountry : form.country}
                            {form.attachment && <> · PDF attached: {form.attachment.name}</>}
                            <br />
                            We&apos;ll contact <b className="text-navy">{form.name}</b> at {form.email}.
                          </p>
                        </div>
                      </>
                    )}
                    {step === WALLET_STEP && idea && token && (
                      <>
                        <WalletStep idea={idea} token={token} />
                        {errors.form && (
                          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-bold text-danger">
                            {errors.form}
                          </p>
                        )}
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>

            {/* footer */}
            {view === "form" && (
              <div className="flex items-center justify-between gap-3 border-t border-line bg-white px-5 py-4 sm:px-7">
                <div className="flex items-center gap-1">
                  {step > 0 ? (
                    <button onClick={back} disabled={busy} className="flex items-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-bold text-muted hover:text-navy">
                      <ArrowLeft className="size-4" /> Back
                    </button>
                  ) : (
                    <span className="text-xs text-muted">Step 1 of {STEPS.length}</span>
                  )}
                  {(step > 0 || token) && (
                    <button onClick={saveForLater} disabled={busy} className="hidden items-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-bold text-muted hover:text-navy sm:flex">
                      <Save className="size-4" /> Save &amp; finish later
                    </button>
                  )}
                </div>
                <button
                  onClick={next}
                  disabled={busy || (step === WALLET_STEP && !canSubmit)}
                  title={step === WALLET_STEP && !canSubmit ? `Fund your wallet with ${fee} to submit` : undefined}
                  className="group flex h-12 items-center gap-2 rounded-xl bg-brand px-6 font-display text-sm font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-600 disabled:opacity-50 disabled:shadow-none"
                >
                  {busy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Submitting…
                    </>
                  ) : step === WALLET_STEP ? (
                    <>
                      Submit idea <Check className="size-4" />
                    </>
                  ) : step === WALLET_STEP - 1 ? (
                    <>
                      Continue to wallet <ArrowRight className="size-4 transition group-hover:translate-x-1" />
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

function Success({ idea, onClose, responseTime }: { idea: Idea; onClose: () => void; responseTime: string }) {
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
        Thanks, {idea.name.split(" ")[0]}! Our team will review <b className="text-navy">{idea.title}</b> and send you a proposal and quote within <b className="text-navy">{responseTime}</b>.
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
      <FeeNote idea={idea} />
      <p className="mx-auto mt-3 max-w-sm rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand-700">
        Check your idea&apos;s status anytime: enter <b className="font-mono">{idea.ref}</b> in the tracker on the home page.
      </p>
      <button onClick={onClose} className="mt-6 h-12 w-full max-w-xs rounded-xl bg-navy font-bold text-white transition hover:bg-navy-700">
        Done
      </button>
    </div>
  );
}

function FeeNote({ idea }: { idea: Idea }) {
  const payment = currentPayment(idea);
  if (!payment) return null;
  return payment.status === "PAID" ? (
    <p className="mx-auto mt-5 flex max-w-sm items-center gap-2 rounded-xl bg-teal-soft px-4 py-3 text-left text-sm text-teal-700">
      <CheckCircle2 className="size-5 shrink-0" /> Wallet funded. Receipt <b className="font-mono">{payment.receiptNo}</b> is in your email.
    </p>
  ) : (
    <p className="mx-auto mt-5 flex max-w-sm items-center gap-2 rounded-xl bg-mist px-4 py-3 text-left text-sm text-navy/80">
      <Clock className="size-5 shrink-0 text-brand" /> We&apos;re confirming your transfer. Review starts once it&apos;s confirmed.
    </p>
  );
}

/** "Started before?" Emails a continue link. Same message whether or not a draft exists. */
function ContinueLater() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<Idea[] | null>(null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-sm font-bold text-muted hover:text-navy">
        <History className="size-4" /> Started an application before? Pick up where you left off
      </button>
    );
  }
  return (
    <div className="rounded-2xl border border-line bg-mist/60 p-4">
      {sent ? (
        <>
          <p className="flex items-start gap-2 text-sm">
            <Mail className="mt-0.5 size-4 shrink-0 text-teal" /> If there&apos;s a saved application for that email, we&apos;ve sent a link to continue it.
          </p>
          {sent.map((d) => (
            <DemoLink key={d.id} href={resumeLink(d)!} label={d.title || d.ref} />
          ))}
        </>
      ) : (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\S+@\S+\.\S+$/.test(email.trim())) setSent(emailResumeLinks(email));
          }}
        >
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="The email you used" aria-label="Email you used before" className={inputClass(false, "h-11")} />
          <button className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-navy px-4 text-sm font-bold text-white hover:bg-navy-700">
            <Mail className="size-4" /> Email me a link
          </button>
        </form>
      )}
    </div>
  );
}

/** Stands in for the emailed link while email is mocked. */
function DemoLink({ href, label }: { href: string; label?: string }) {
  return (
    <a href={href} className="mx-auto mt-3 flex w-fit items-center gap-1.5 rounded-full border border-dashed border-line bg-white px-3 py-1.5 text-xs font-bold text-muted hover:text-navy">
      <Link2 className="size-3.5" /> Demo: open the emailed link{label ? ` for ${label}` : ""}
    </a>
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
