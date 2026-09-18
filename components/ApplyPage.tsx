"use client";

/**
 * The idea application.
 *
 * `IdeaWizard` is the whole form, and it is the only copy: the modal on the home page
 * and the /apply page both render it. /apply is the canonical home of an application —
 * the server emails resume links as `/apply?resume=<token>` and Paystack sends payers
 * back to `/apply?ref=IDEA-…&payment=…&reference=…`.
 *
 * Nothing about an application is kept in this browser except the private resume token
 * (wallet.ts does that). The form itself, how much is still missing and whether the fee
 * is paid all come from the server, so a half-filled draft opened on a second device
 * carries on exactly where it stopped.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  History,
  Lightbulb,
  Link2,
  Loader2,
  Mail,
  Save,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import Logo from "./Logo";
import WalletLedger from "./wallet/WalletLedger";
import WalletStep, { type PaystackReturn } from "./wallet/WalletStep";
import { errorMessage } from "@/lib/api";
import { track } from "@/lib/track";
import { useSiteContent } from "@/lib/content";
import { formatBytes, validatePdf } from "@/lib/files";
import { cn, relativeDay } from "@/lib/format";
import { IDEA_STATUSES } from "@/lib/ideas";
import { COUNTRIES, OTHER_COUNTRY, findCountry } from "@/lib/locations";
import {
  checkoutFeeLabel,
  clearPaystackResult,
  createDraft,
  currentPayment,
  draftMissing,
  emailResumeLinks,
  forgetDraft,
  paystackResult,
  saveDraft,
  submitDraft,
  useApplication,
  useRememberedDraft,
  type Application,
  type ApplicationFields,
  type DraftFields,
} from "@/lib/wallet";

const STEPS = ["About you", "Your idea", "Budget & timeline", "Commitment fee"];
const WALLET_STEP = 3;
/** Analytics names for each step, in order (spec 7.3). */
const STEP_EVENTS = ["about_you", "idea", "budget", "payment"] as const;

/** `draftMissing` names the sections; these are the steps that hold them. */
const SECTION_STEP: Record<string, number> = { "About you": 0, "Your idea": 1, "Budget & timeline": 2 };

const EMAIL = /^\S+@\S+\.\S+$/;

interface FormState {
  name: string;
  email: string;
  phone: string;
  organisation: string;
  country: string;
  customCountry: string;
  state: string;
  title: string;
  category: string;
  platforms: string[];
  problem: string;
  targetUsers: string;
  features: string;
  budget: string;
  timeline: string;
  nda: boolean;
}

type Errors = Partial<Record<keyof FormState | "attachment" | "form", string>>;
type View = "loading" | "resume" | "form" | "saved" | "done" | "submitted" | "lost" | "error";

const EMPTY: FormState = {
  name: "",
  email: "",
  phone: "",
  organisation: "",
  country: "",
  customCountry: "",
  state: "",
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

/** Half-filled drafts come back with nulls everywhere, so every field is coalesced. */
function formFrom(fields: ApplicationFields): FormState {
  const country = fields.country ?? "";
  const known = !country || COUNTRIES.some((c) => c.name === country);
  return {
    name: fields.name ?? "",
    email: fields.email ?? "",
    phone: fields.phone ?? "",
    organisation: fields.organisation ?? "",
    country: known ? country : OTHER_COUNTRY,
    customCountry: known ? "" : country,
    state: fields.state ?? "",
    title: fields.title ?? "",
    category: fields.category ?? "",
    platforms: fields.platforms ?? [],
    problem: fields.problem ?? "",
    targetUsers: fields.targetUsers ?? "",
    features: fields.features ?? "",
    budget: fields.budget ?? "",
    timeline: fields.timeline ?? "",
    nda: fields.nda,
  };
}

/** Everything typed so far. Empty fields go as null, which clears them on the server. */
function fieldsFrom(f: FormState): DraftFields {
  const country = f.country === OTHER_COUNTRY ? f.customCountry.trim() : f.country;
  return {
    name: f.name.trim() || null,
    email: f.email.trim(),
    phone: f.phone.trim() || null,
    organisation: f.organisation.trim() || null,
    country: country || null,
    state: f.state.trim() || null,
    title: f.title.trim() || null,
    category: f.category || null,
    platforms: f.platforms,
    problem: f.problem.trim() || null,
    targetUsers: f.targetUsers.trim() || null,
    features: f.features.trim() || null,
    budget: f.budget || null,
    timeline: f.timeline || null,
    nda: f.nda,
  };
}

/** Where to drop someone back in: the first section the server still wants. */
function resumeStep(application: Application) {
  const first = draftMissing(application)[0];
  return first === undefined ? WALLET_STEP : (SECTION_STEP[first] ?? 0);
}

function validate(step: number, f: FormState): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (f.name.trim().length < 2) e.name = "Please enter your full name.";
    if (!EMAIL.test(f.email.trim())) e.email = "Enter a valid email so we can send your proposal.";
    if (f.phone.replace(/\D/g, "").length < 10) e.phone = "Enter a phone number we can call or text.";
    if (!f.country) e.country = "Choose your country.";
    else if (f.country === OTHER_COUNTRY && f.customCountry.trim().length < 2) e.customCountry = "Enter your country.";
    if (f.country && !f.state.trim()) e.state = `Choose your ${(findCountry(f.country)?.regionLabel ?? "state / region").toLowerCase()}.`;
  }
  if (step === 1) {
    if (f.title.trim().length < 2) e.title = "Give your idea a working name.";
    if (!f.category) e.category = "Choose the closest category.";
    if (f.platforms.length === 0) e.platforms = "Pick at least one.";
    if (f.problem.trim().length < 15) e.problem = "Describe the problem in a sentence or two.";
    if (f.targetUsers.trim().length < 3) e.targetUsers = "Who will use it?";
    if (f.features.trim().length < 10) e.features = "List a few key things it should do.";
  }
  if (step === 2) {
    if (!f.budget) e.budget = 'Choose a budget range. "Not sure yet" is fine.';
    if (!f.timeline) e.timeline = "Choose when you'd like it ready.";
  }
  return e;
}

/* ================= the wizard ================= */

export function IdeaWizard({
  variant,
  initialEmail,
  resumeToken,
  paystackReturn,
  onClose,
}: {
  variant: "modal" | "page";
  initialEmail?: string;
  resumeToken?: string | null;
  paystackReturn?: PaystackReturn | null;
  onClose?: () => void;
}) {
  const { ideaForm } = useSiteContent();
  const remembered = useRememberedDraft();
  const [token, setToken] = useState<string | null>(null);
  const { application, error, refresh } = useApplication(token);

  const [view, setView] = useState<View>("loading");
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [form, setForm] = useState<FormState>(() => ({ ...EMPTY, email: initialEmail ?? "" }));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState<"" | "step" | "save" | "attach" | "submit">("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [sent, setSent] = useState<{ ref: string; title: string | null } | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const resolved = useRef(false);

  useEffect(() => setMounted(true), []);

  // Where this visit starts: an emailed link, the draft this browser remembers, or nothing.
  // It happens once; after that the person drives.
  useEffect(() => {
    if (resolved.current || !mounted) return;
    if (resumeToken) {
      resolved.current = true;
      setToken(resumeToken);
      return; // the effect below takes over once the application arrives
    }
    if (remembered.loading) return;
    resolved.current = true;
    // Coming back from Paystack goes straight to the fee step, not to "welcome back".
    if (paystackReturn && remembered.token) setToken(remembered.token);
    else if (remembered.token && remembered.application) setView("resume");
    else if (paystackReturn) setView("lost");
    else setView("form");
  }, [mounted, resumeToken, remembered.loading, remembered.token, remembered.application, paystackReturn]);

  // Counted once each time the form is opened, as a modal or as the /apply page.
  useEffect(() => {
    track("idea_form", "opened", { step: "opened", variant });
  }, [variant]);

  // The server's copy is the truth: fill the form from it the first time it arrives.
  useEffect(() => {
    if (!token || !application || loadedFor === token) return;
    setLoadedFor(token);
    setForm(formFrom(application.fields));
    setErrors({});
    if (application.status !== "DRAFT") {
      setView("submitted");
      return;
    }
    setStep(paystackReturn ? WALLET_STEP : resumeStep(application));
    setView("form");
  }, [token, application, loadedFor, paystackReturn]);

  useEffect(() => {
    if (token && error && !application) setView("error");
  }, [token, error, application]);

  // Back from Paystack: ask the server what really happened, whatever the URL claims.
  useEffect(() => {
    if (paystackReturn && token) void refresh();
  }, [paystackReturn, token, refresh]);

  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
  }, []);

  const focusInvalid = () => {
    window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(), 0);
  };

  const goTo = (next: number) => {
    if (next > step) track("idea_form", STEP_EVENTS[next] ?? null, { step: STEP_EVENTS[next], variant });
    setDir(next > step ? 1 : -1);
    setStep(next);
    rootRef.current?.querySelector(".modal-scroll")?.scrollTo({ top: 0 });
    if (variant === "page") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Saves what's typed so far. The first save creates the draft and emails the continue link. */
  const persist = async (file?: { attachment?: File; removeAttachment?: boolean }) => {
    const fields = fieldsFrom(form);
    if (token) {
      await saveDraft(token, fields, file);
    } else {
      const created = await createDraft(fields, file?.attachment);
      track("idea_form", "draft_saved", { step: "draft_saved", variant });
      setToken(created.token);
      setLoadedFor(created.token);
      setDevLink(created.devLink ?? null);
    }
    flashSaved();
  };

  const next = async () => {
    if (busy) return;
    if (step < WALLET_STEP) {
      const found = validate(step, form);
      if (Object.keys(found).length) {
        setErrors(found);
        focusInvalid();
        return;
      }
      setErrors({});
      setBusy("step");
      try {
        await persist();
        goTo(step + 1);
      } catch (e) {
        setErrors({ form: errorMessage(e) });
      } finally {
        setBusy("");
      }
      return;
    }
    if (!token) return;
    // Anything left incomplete earlier would be refused by the server, so check it here first.
    for (let s = 0; s < WALLET_STEP; s++) {
      const found = validate(s, form);
      if (Object.keys(found).length) {
        setErrors(found);
        goTo(s);
        focusInvalid();
        return;
      }
    }
    setErrors({});
    setBusy("submit");
    try {
      await saveDraft(token, fieldsFrom(form));
      const result = await submitDraft(token);
      track("idea_form", "submitted", { step: "submitted", variant });
      setSent({ ref: result.ref, title: result.title });
      setView("done");
    } catch (e) {
      setErrors({ form: errorMessage(e) });
    } finally {
      setBusy("");
    }
  };

  const back = () => {
    if (busy || step === 0) return;
    setErrors({});
    goTo(step - 1);
  };

  const saveForLater = async () => {
    if (busy) return;
    if (!EMAIL.test(form.email.trim())) {
      setErrors({ email: "Enter a valid email first, so we can send you a link back." });
      goTo(0);
      focusInvalid();
      return;
    }
    setErrors({});
    setBusy("save");
    try {
      await persist();
      setView("saved");
    } catch (e) {
      setErrors({ form: errorMessage(e) });
    } finally {
      setBusy("");
    }
  };

  const attach = async (file: File | undefined) => {
    if (!file || busy) return;
    const problem = await validatePdf(file);
    if (problem) {
      setErrors((e) => ({ ...e, attachment: problem }));
      return;
    }
    setBusy("attach");
    setErrors((e) => ({ ...e, attachment: undefined }));
    try {
      await persist({ attachment: file });
    } catch (e) {
      setErrors((x) => ({ ...x, attachment: errorMessage(e) }));
    } finally {
      setBusy("");
    }
  };

  const removeAttachment = async () => {
    if (busy || !token) return;
    setBusy("attach");
    try {
      await persist({ removeAttachment: true });
    } catch (e) {
      setErrors((x) => ({ ...x, attachment: errorMessage(e) }));
    } finally {
      setBusy("");
    }
  };

  const startFresh = () => {
    forgetDraft();
    setToken(null);
    setLoadedFor(null);
    setDevLink(null);
    setForm({ ...EMPTY, email: initialEmail ?? "" });
    setErrors({});
    setStep(0);
    setView("form");
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const waitingForApplication = view === "form" && step === WALLET_STEP && !application;
  const opening = view === "loading" || (view === "form" && !!token && !application && loadedFor !== token);
  const headingClass = "mt-1.5 font-display text-2xl font-bold";
  const title = {
    loading: "One moment…",
    resume: "Welcome back",
    form: "Tell us what you want to build",
    saved: "Your application is saved",
    done: "We've got your idea!",
    submitted: "Your application",
    lost: "We can't find your application here",
    error: "This link doesn't work",
  }[view];

  return (
    <div ref={rootRef} className={cn("flex flex-col", variant === "modal" && "min-h-0 flex-1")}>
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
            {variant === "page" ? (
              <h1 id="idea-title" className={headingClass}>
                {title}
              </h1>
            ) : (
              <h2 id="idea-title" className={headingClass}>
                {title}
              </h2>
            )}
            {view === "form" && <p className="mt-1 text-sm text-white/65">{ideaForm.intro}</p>}
          </div>
          <div className="flex items-center gap-2">
            <AnimatePresence>
              {savedFlash && (
                <motion.span
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role="status"
                  className="flex items-center gap-1 rounded-full bg-teal/20 px-2.5 py-1 text-xs font-bold text-teal-soft"
                >
                  <Check className="size-3.5" /> Saved
                </motion.span>
              )}
            </AnimatePresence>
            {onClose && (
              <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2 transition hover:bg-white/20">
                <X className="size-5" />
              </button>
            )}
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
      <div className={cn("modal-scroll", variant === "modal" && "min-h-0 flex-1 overflow-y-auto overflow-x-hidden")}>
        {opening ? (
          <div className="grid h-56 place-items-center" aria-live="polite">
            <Loader2 className="size-8 animate-spin text-brand" />
            <span className="sr-only">Loading your application</span>
          </div>
        ) : view === "error" ? (
          <div className="p-6 text-center sm:p-10">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-danger-soft">
              <AlertCircle className="size-8 text-danger" />
            </span>
            <p className="mt-4 text-muted" aria-live="polite">
              {error ?? "The link may be old or mistyped."} Enter the email you used and we&apos;ll send a fresh link.
            </p>
            <div className="mx-auto mt-5 max-w-sm text-left">
              <ContinueLater openByDefault />
            </div>
            <button onClick={startFresh} className="mt-6 h-12 w-full max-w-xs rounded-xl bg-brand font-bold text-white transition hover:bg-brand-600">
              Start a new application
            </button>
          </div>
        ) : view === "lost" ? (
          <div className="p-6 text-center sm:p-10">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-brand-soft">
              <History className="size-8 text-brand" />
            </span>
            <p className="mt-4 text-muted" aria-live="polite">
              {paystackReturn?.ref ? (
                <>
                  We have your payment for <b className="font-mono text-navy">{paystackReturn.ref}</b>, but this browser doesn&apos;t remember the application it belongs to.
                </>
              ) : (
                <>This browser doesn&apos;t remember an application.</>
              )}{" "}
              Open the link we emailed you, or ask for a fresh one.
            </p>
            <div className="mx-auto mt-5 max-w-sm text-left">
              <ContinueLater openByDefault />
            </div>
            <button onClick={startFresh} className="mt-6 h-12 w-full max-w-xs rounded-xl border border-line font-bold text-muted transition hover:text-navy">
              Start a new application
            </button>
          </div>
        ) : view === "resume" && remembered.application && remembered.token ? (
          <ResumeCard
            application={remembered.application}
            onContinue={() => {
              setToken(remembered.token);
              setView("loading");
            }}
            onFresh={startFresh}
          />
        ) : view === "saved" ? (
          <div className="p-6 text-center sm:p-10">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-teal-soft">
              <Save className="size-8 text-teal" />
            </span>
            <p className="mt-4 text-muted">
              Close this page anytime. We emailed a link to <b className="text-navy">{application?.fields.email ?? form.email.trim()}</b> so you can continue from any
              device. This browser also remembers where you stopped.
            </p>
            {devLink && <DemoLink href={devLink} />}
            <button
              onClick={() => {
                if (onClose) onClose();
                else setView("form");
              }}
              className="mt-6 h-12 w-full max-w-xs rounded-xl bg-navy font-bold text-white transition hover:bg-navy-700"
            >
              {onClose ? "Done" : "Back to my application"}
            </button>
          </div>
        ) : view === "done" && application ? (
          <Success application={application} sent={sent} responseTime={ideaForm.responseTime} onClose={onClose} />
        ) : view === "submitted" && application ? (
          <div className="space-y-4 p-5 sm:p-7">
            <div className="flex items-start justify-between gap-3 rounded-2xl bg-mist p-4">
              <div>
                <p className="font-mono text-xs text-muted">{application.ref}</p>
                <p className="font-display text-lg font-bold">{application.fields.title ?? "Your idea"}</p>
                {application.submittedAt && <p className="text-xs text-muted">Submitted {relativeDay(application.submittedAt).toLowerCase()}</p>}
              </div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", IDEA_STATUSES[application.status].className)}>
                {IDEA_STATUSES[application.status].label}
              </span>
            </div>
            <p className="text-sm text-muted">
              This application has already been sent to us, so it can&apos;t be edited. Track it with your reference <b className="font-mono text-navy">{application.ref}</b>{" "}
              on the home page.
            </p>
            <WalletLedger entries={application.wallet} />
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
                  {application?.source === "walk_in" && (
                    <p className="rounded-xl bg-blue-soft px-4 py-3 text-sm">
                      Our team started this application with you at the centre. Check your details, add what&apos;s missing, then pay the commitment fee.
                    </p>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Text label="Full name" id="name" value={form.name} onChange={(v) => set("name", v)} error={errors.name} autoComplete="name" placeholder="e.g. Ada Okafor" />
                    <Text
                      label="Organisation"
                      optional
                      id="organisation"
                      value={form.organisation}
                      onChange={(v) => set("organisation", v)}
                      autoComplete="organization"
                      placeholder="Business, NGO or school"
                    />
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
                      const country = findCountry(form.country);
                      const label = country?.regionLabel ?? "State / region";
                      return country ? (
                        <Field label={label} id="state" error={errors.state}>
                          <select id="state" value={form.state} onChange={(e) => set("state", e.target.value)} aria-invalid={!!errors.state} className={inputClass(!!errors.state, "h-12")}>
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
                    <Text
                      label="Country name"
                      id="customCountry"
                      value={form.customCountry}
                      onChange={(v) => set("customCountry", v)}
                      error={errors.customCountry}
                      autoComplete="country-name"
                      placeholder="e.g. Zambia"
                    />
                  )}
                  {!token && <ContinueLater />}
                </>
              )}

              {step === 1 && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Text label="Idea name" id="title" value={form.title} onChange={(v) => set("title", v)} error={errors.title} placeholder="A working name is fine" />
                    <Field label="Category" id="category" error={errors.category}>
                      <select id="category" value={form.category} onChange={(e) => set("category", e.target.value)} aria-invalid={!!errors.category} className={inputClass(!!errors.category, "h-12")}>
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
                  <Area
                    label="What problem does it solve?"
                    id="problem"
                    value={form.problem}
                    onChange={(v) => set("problem", v)}
                    error={errors.problem}
                    placeholder="e.g. Farmers can't reach buyers in the city, so they sell at very low prices."
                  />
                  <Area
                    label="Who will use it?"
                    id="targetUsers"
                    rows={2}
                    value={form.targetUsers}
                    onChange={(v) => set("targetUsers", v)}
                    error={errors.targetUsers}
                    placeholder="e.g. Smallholder farmers and restaurant owners in Lagos"
                  />
                  <Area
                    label="Key features"
                    id="features"
                    value={form.features}
                    onChange={(v) => set("features", v)}
                    error={errors.features}
                    placeholder="e.g. List produce with photos, order and pay online, track delivery"
                  />
                  <Field label="Project document" optional id="attachment" error={errors.attachment}>
                    {application?.attachment ? (
                      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-3 rounded-xl border border-teal/40 bg-teal-soft/60 p-3">
                        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-white text-danger shadow-sm">
                          <FileText className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{application.attachment.name}</span>
                          <span className="flex items-center gap-1 text-xs text-teal-700">
                            <CheckCircle2 className="size-3.5" /> Saved · {formatBytes(application.attachment.size)}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={removeAttachment}
                          disabled={busy === "attach"}
                          aria-label="Remove document"
                          className="rounded-lg p-2 text-muted transition hover:bg-white hover:text-danger disabled:opacity-50"
                        >
                          {busy === "attach" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                        </button>
                      </motion.div>
                    ) : (
                      <FileDrop busy={busy === "attach"} invalid={!!errors.attachment} onFile={attach} />
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
                      {application?.attachment && <> · PDF attached: {application.attachment.name}</>}
                      <br />
                      We&apos;ll contact <b className="text-navy">{form.name}</b> at {form.email}.
                    </p>
                  </div>
                </>
              )}

              {step === WALLET_STEP &&
                (application && token ? (
                  <WalletStep application={application} token={token} paystackReturn={paystackReturn} onRefresh={() => void refresh()} />
                ) : (
                  <div className="grid h-40 place-items-center">
                    <Loader2 className="size-7 animate-spin text-brand" />
                  </div>
                ))}

              <p aria-live="polite">
                {errors.form && <span className="block rounded-xl bg-danger-soft px-4 py-3 text-sm font-bold text-danger">{errors.form}</span>}
              </p>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* footer */}
      {view === "form" && !waitingForApplication && (
        <div className="flex items-center justify-between gap-3 border-t border-line bg-white px-5 py-4 sm:px-7">
          <div className="flex items-center gap-1">
            {step > 0 ? (
              <button onClick={back} disabled={!!busy} className="flex items-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-bold text-muted transition hover:text-navy disabled:opacity-50">
                <ArrowLeft className="size-4" /> Back
              </button>
            ) : (
              <span className="text-xs text-muted">Step 1 of {STEPS.length}</span>
            )}
            {(step > 0 || token) && (
              <button
                data-track="apply_save_later"
                onClick={saveForLater}
                disabled={!!busy}
                className="hidden items-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-bold text-muted transition hover:text-navy disabled:opacity-50 sm:flex"
              >
                {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save &amp; finish later
              </button>
            )}
          </div>
          <button
            onClick={next}
            disabled={!!busy || (step === WALLET_STEP && !application?.canSubmit)}
            title={step === WALLET_STEP && !application?.canSubmit ? "Pay the commitment fee to submit your idea" : undefined}
            className="group flex h-12 items-center gap-2 rounded-xl bg-brand px-6 font-display text-sm font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-600 disabled:opacity-50 disabled:shadow-none"
          >
            {busy === "submit" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Submitting…
              </>
            ) : busy === "step" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving…
              </>
            ) : step === WALLET_STEP ? (
              <>
                Submit idea <Check className="size-4" />
              </>
            ) : step === WALLET_STEP - 1 ? (
              <>
                Continue to payment <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </>
            ) : (
              <>
                Continue <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/* ================= the /apply page ================= */

/**
 * The page the emailed resume link and Paystack's callback both land on.
 * Both carry private values in the query string, so they're read once on the client
 * and then taken back out of the address bar.
 */
export default function ApplyPage() {
  const [route, setRoute] = useState<{ resume: string | null; paystack: PaystackReturn | null } | null>(null);

  useEffect(() => {
    const resume = new URLSearchParams(window.location.search).get("resume");
    const paystack = paystackResult();
    if (paystack) {
      clearPaystackResult();
      track("payment", paystack.outcome === "failed" ? "returned_failed" : "returned_success", { method: "paystack", step: paystack.outcome === "failed" ? "returned_failed" : "returned_success" });
    }
    if (resume) {
      const url = new URL(window.location.href);
      url.searchParams.delete("resume");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    setRoute({ resume, paystack });
  }, []);

  return (
    <div className="min-h-screen bg-mist">
      <header className="bg-navy">
        <div className="container-page flex h-16 items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <span className="flex items-center gap-1.5 text-xs text-white/60">
            <ShieldCheck className="size-4 text-teal" /> Private application link
          </span>
        </div>
      </header>

      <main className="container-page max-w-2xl py-8 sm:py-12">
        <div className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-navy/5">
          {route === null ? (
            <div className="grid h-72 place-items-center" aria-live="polite">
              <Loader2 className="size-8 animate-spin text-brand" />
              <span className="sr-only">Opening your application</span>
            </div>
          ) : (
            <IdeaWizard variant="page" resumeToken={route.resume} paystackReturn={route.paystack} />
          )}
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          Keep this link private: anyone with it can edit your application.{" "}
          <Link href="/" className="font-bold underline underline-offset-2 hover:text-navy">
            Back to the homepage
          </Link>
        </p>
      </main>
    </div>
  );
}

/* ================= pieces ================= */

function ResumeCard({ application, onContinue, onFresh }: { application: Application; onContinue: () => void; onFresh: () => void }) {
  const savedAt = application.lastSavedAt ?? application.createdAt;
  const left = draftMissing(application);
  return (
    <div className="p-6 text-center sm:p-10">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-brand-soft">
        <History className="size-8 text-brand" />
      </span>
      <p className="mt-4 text-muted">You have an unfinished application saved{savedAt ? ` ${relativeDay(savedAt).toLowerCase()}` : ""}.</p>
      <div className="mx-auto mt-4 max-w-sm rounded-2xl border border-line p-4 text-left">
        <p className="font-display font-semibold">{application.fields.title || "Untitled idea"}</p>
        <p className="text-xs text-muted">
          {application.ref} · {left.length ? `still to fill in: ${left.join(", ").toLowerCase()}` : "all questions answered"} ·{" "}
          {application.payment.status === "PAID" ? "fee paid" : `${checkoutFeeLabel(application.checkout)} fee not paid yet`}
        </p>
      </div>
      <div className="mx-auto mt-6 flex max-w-sm flex-col gap-2 sm:flex-row">
        <button onClick={onFresh} className="h-12 flex-1 rounded-xl border border-line font-bold text-muted transition hover:text-navy">
          Start a new idea
        </button>
        <button onClick={onContinue} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand font-bold text-white transition hover:bg-brand-600">
          Continue <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

function Success({
  application,
  sent,
  responseTime,
  onClose,
}: {
  application: Application;
  sent: { ref: string; title: string | null } | null;
  responseTime: string;
  onClose?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const ref = sent?.ref ?? application.ref;
  const title = sent?.title ?? application.fields.title;
  const firstName = (application.fields.name ?? "").split(" ")[0];
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
        Thanks{firstName ? `, ${firstName}` : ""}! Our team will review <b className="text-navy">{title ?? "your idea"}</b> and send you a proposal and quote within{" "}
        <b className="text-navy">{responseTime}</b>.
      </p>
      <div className="mx-auto mt-5 flex max-w-xs items-center justify-between gap-3 rounded-2xl bg-mist px-4 py-3">
        <span className="text-left">
          <span className="block text-xs text-muted">Your reference</span>
          <span className="font-mono text-lg font-bold">{ref}</span>
        </span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(ref).catch(() => {});
            setCopied(true);
          }}
          className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold shadow-sm"
        >
          {copied ? <Check className="size-3.5 text-teal" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <ol className="mx-auto mt-6 max-w-sm space-y-3 text-left text-sm">
        {["We review your idea and pick the right tech stack.", "You get a proposal and quote by email.", "Once you accept, we email your Project ID so you can track the build here."].map(
          (t, i) => (
            <motion.li key={t} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.12 }} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-white">{i + 1}</span>
              <span className="text-navy/80">{t}</span>
            </motion.li>
          ),
        )}
      </ol>
      <FeeNote application={application} />
      <p className="mx-auto mt-3 max-w-sm rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand-700">
        Check your idea&apos;s status anytime: enter <b className="font-mono">{ref}</b> in the tracker on the home page.
      </p>
      {onClose ? (
        <button onClick={onClose} className="mt-6 h-12 w-full max-w-xs rounded-xl bg-navy font-bold text-white transition hover:bg-navy-700">
          Done
        </button>
      ) : (
        <Link href="/#track" className="mt-6 inline-flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-navy font-bold text-white transition hover:bg-navy-700">
          Track your idea <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

function FeeNote({ application }: { application: Application }) {
  const payment = currentPayment(application);
  if (!payment) return null;
  return payment.status === "PAID" ? (
    <p className="mx-auto mt-5 flex max-w-sm items-center gap-2 rounded-xl bg-teal-soft px-4 py-3 text-left text-sm text-teal-700">
      <CheckCircle2 className="size-5 shrink-0" /> Commitment fee paid.{payment.receiptNo ? <> Receipt <b className="font-mono">{payment.receiptNo}</b> is in your email.</> : null}
    </p>
  ) : (
    <p className="mx-auto mt-5 flex max-w-sm items-center gap-2 rounded-xl bg-mist px-4 py-3 text-left text-sm text-navy/80">
      <Clock className="size-5 shrink-0 text-brand" /> We&apos;re confirming your transfer. Review starts once it&apos;s confirmed.
    </p>
  );
}

/** "Started before?" Emails a continue link. The answer is the same whether or not we know the address. */
function ContinueLater({ openByDefault }: { openByDefault?: boolean }) {
  const [open, setOpen] = useState(!!openByDefault);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ message: string; devLinks?: string[] } | null>(null);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-sm font-bold text-muted transition hover:text-navy">
        <History className="size-4" /> Started an application before? Pick up where you left off
      </button>
    );
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!EMAIL.test(email.trim())) {
      setError("Enter the email you used before.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setSent(await emailResumeLinks(email));
      track("idea_form", "resume_link_requested", { step: "resume_link_requested" });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-mist/60 p-4" aria-live="polite">
      {sent ? (
        <>
          <p className="flex items-start gap-2 text-sm">
            <Mail className="mt-0.5 size-4 shrink-0 text-teal" /> {sent.message}
          </p>
          {sent.devLinks?.map((href) => <DemoLink key={href} href={href} />)}
        </>
      ) : (
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={send} noValidate>
          <label htmlFor="resume-email" className="sr-only">
            The email you used before
          </label>
          <input
            id="resume-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError("");
            }}
            placeholder="The email you used"
            aria-invalid={!!error}
            className={inputClass(!!error, "h-11")}
          />
          <button disabled={busy} className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-navy px-4 text-sm font-bold text-white transition hover:bg-navy-700 disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Email me a link
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-xs font-bold text-danger">{error}</p>}
    </div>
  );
}

/** Stands in for the emailed link outside production, where the API hands it back. */
function DemoLink({ href }: { href: string }) {
  return (
    <a href={href} className="mx-auto mt-3 flex w-fit items-center gap-1.5 rounded-full border border-dashed border-line bg-white px-3 py-1.5 text-xs font-bold text-muted transition hover:text-navy">
      <Link2 className="size-3.5" /> Demo: open the emailed link
    </a>
  );
}

function FileDrop({ busy, invalid, onFile }: { busy: boolean; invalid: boolean; onFile: (file: File | undefined) => void }) {
  const [dragOver, setDragOver] = useState(false);
  return (
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
        onFile(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition",
        dragOver ? "border-brand bg-brand-soft/50" : invalid ? "border-danger/50 bg-danger-soft/30" : "border-line hover:border-brand/50 hover:bg-mist/60",
      )}
    >
      {busy ? (
        <Loader2 className="size-7 animate-spin text-brand" />
      ) : (
        <motion.span animate={dragOver ? { y: -4, scale: 1.1 } : { y: 0, scale: 1 }}>
          <UploadCloud className="size-7 text-brand" />
        </motion.span>
      )}
      <span className="text-sm font-bold">{busy ? "Uploading…" : "Drop your PDF here or click to browse"}</span>
      <span className="text-xs text-muted">Business plan, brief or sketches · PDF only · max 10 MB</span>
      <input
        id="attachment"
        type="file"
        accept="application/pdf,.pdf"
        disabled={busy}
        className="sr-only"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );
}

/* ================= small form controls ================= */

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

function Area({
  label,
  id,
  value,
  onChange,
  error,
  placeholder,
  rows = 3,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  rows?: number;
}) {
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
