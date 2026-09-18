"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { AlertCircle, ArrowDown, ArrowLeft, ArrowRight, CheckCircle2, Clock, Lightbulb, Loader2, Lock, Search, ShieldCheck, Wallet, XCircle } from "lucide-react";
import { feeState, paidPayment } from "@/lib/wallet";
import { formatPrice } from "@/lib/catalog";
import { DEMO_IDS, DEMO_OTP, STAGES } from "@/lib/data";
import { findProject, findRevoked } from "@/lib/store";
import { lookupIdea } from "@/lib/actions";
import { IDEA_STATUSES, type Idea } from "@/lib/ideas";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/format";
import { useSiteContent } from "@/lib/content";

const ID_PATTERN = /^APC-\d{2}-[A-Z0-9]{5}$/;
const IDEA_PATTERN = /^IDEA-[A-Z0-9]{5}$/;
const MAX_ATTEMPTS = 5;

function formatId(value: string) {
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.startsWith("IDEA")) return raw.length > 4 ? `IDEA-${raw.slice(4, 9)}` : raw;
  return [raw.slice(0, 3), raw.slice(3, 5), raw.slice(5, 10)].filter(Boolean).join("-");
}

const panel = {
  initial: { opacity: 0, y: 14, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.98 },
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
} as const;

export default function Tracker({
  onVerified,
  onReset,
  verifiedProject,
}: {
  onVerified: (code: string) => void;
  onReset: () => void;
  verifiedProject?: Project;
}) {
  const [candidate, setCandidate] = useState<Project | null>(null);
  const [idea, setIdea] = useState<{ idea: Idea; project?: Project } | null>(null);
  const step = verifiedProject ? "done" : candidate ? "otp" : idea ? "idea" : "id";

  return (
    <div className="relative max-w-xl">
      <div className="absolute -inset-px rounded-[22px] bg-gradient-to-r from-brand/60 via-white/10 to-teal/50 opacity-70 blur-[1px]" />
      <div className="relative rounded-[21px] border border-white/10 bg-navy-800/80 p-2 shadow-2xl shadow-navy-950/50 backdrop-blur-xl">
        <AnimatePresence mode="wait" initial={false}>
          {step === "id" && (
            <motion.div key="id" {...panel}>
              <IdStep onFound={setCandidate} onIdea={setIdea} />
            </motion.div>
          )}
          {step === "idea" && idea && (
            <motion.div key="idea" {...panel}>
              <IdeaStep
                result={idea}
                onBack={() => setIdea(null)}
                onTrack={(p) => {
                  setIdea(null);
                  setCandidate(p);
                }}
              />
            </motion.div>
          )}
          {step === "otp" && candidate && (
            <motion.div key="otp" {...panel}>
              <OtpStep project={candidate} onBack={() => setCandidate(null)} onVerified={() => onVerified(candidate.code)} />
            </motion.div>
          )}
          {step === "done" && verifiedProject && (
            <motion.div key="done" {...panel}>
              <DoneStep project={verifiedProject} onReset={onReset} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function IdStep({ onFound, onIdea }: { onFound: (p: Project) => void; onIdea: (r: { idea: Idea; project?: Project }) => void }) {
  const { hero } = useSiteContent();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const shake = useAnimationControls();
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

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

  const fail = (message: string, counts: boolean) => {
    shake.start({ x: [0, -10, 10, -7, 7, -3, 0], transition: { duration: 0.45 } });
    if (counts) {
      const n = attempts + 1;
      if (n >= MAX_ATTEMPTS) {
        setAttempts(0);
        setNow(Date.now());
        setLockedUntil(Date.now() + 30_000);
        setError("Too many attempts. For your security, please wait before trying again.");
        return;
      }
      setAttempts(n);
    }
    setError(message);
  };

  const lookup = (raw: string) => {
    if (busy || lockedFor > 0) return;
    const id = formatId(raw);
    setValue(id);
    if (!id) return fail("Please enter your Project ID or idea reference.", false);
    const isIdea = IDEA_PATTERN.test(id);
    if (!isIdea && !ID_PATTERN.test(id))
      return fail("Project IDs look like APC-26-7KQ9X, and idea references look like IDEA-4QX7M. Check your email or SMS.", false);
    setBusy(true);
    setError("");
    window.setTimeout(() => {
      setBusy(false);
      if (isIdea) {
        const result = lookupIdea(id);
        if (result) onIdea(result);
        else fail(`We couldn't find an idea with reference ${id}.`, true);
        return;
      }
      const p = findProject(id);
      if (p) onFound(p);
      else if (findRevoked(id)) fail(`${id} has been replaced with a new Project ID for security. Check your latest email or SMS.`, true);
      else fail(`We couldn't find a project with ID ${id}. Check for typos and try again.`, true);
    }, 900);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        lookup(value);
      }}
      noValidate
    >
      <label htmlFor="project-id" className="flex items-center justify-between px-3 pb-2 pt-2 text-sm">
        <span className="font-display font-semibold text-white">{hero.trackerLabel}</span>
        <span className="hidden items-center gap-1 text-xs text-white/50 sm:flex">
          <Lock className="size-3" /> Encrypted
        </span>
      </label>

      <motion.div
        animate={shake}
        className={cn(
          "flex flex-col gap-2 rounded-2xl bg-white p-1.5 transition sm:flex-row sm:items-center",
          error ? "ring-2 ring-danger/70" : "focus-within:ring-4 focus-within:ring-brand/30",
        )}
      >
        <div className="flex flex-1 items-center gap-3 pl-3">
          <Search className="size-5 shrink-0 text-muted" />
          <input
            ref={inputRef}
            id="project-id"
            value={value}
            onChange={(e) => {
              setValue(formatId(e.target.value));
              if (error && !lockedFor) setError("");
            }}
            placeholder={hero.trackerPlaceholder}
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            aria-invalid={!!error}
            aria-describedby="project-id-help"
            disabled={lockedFor > 0}
            className="h-12 w-full min-w-0 bg-transparent font-display text-base font-semibold tracking-wider text-navy uppercase outline-none placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:normal-case placeholder:text-muted/80"
          />
        </div>
        <button
          type="submit"
          disabled={busy || lockedFor > 0}
          className="group relative flex h-12 items-center justify-center gap-2 overflow-hidden rounded-xl bg-brand px-6 font-display text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="absolute inset-y-0 left-0 w-1/3 -skew-x-12 animate-shimmer bg-white/20" />
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Finding project…
            </>
          ) : lockedFor > 0 ? (
            <>Try again in {lockedFor}s</>
          ) : (
            <>
              {hero.trackerButton} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
            </>
          )}
        </button>
      </motion.div>

      <div id="project-id-help" className="min-h-0 px-3" aria-live="polite">
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2 pt-3 text-sm text-[#ffb4a8]"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {hero.showDemoIds && (
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2 pt-3">
        <span className="text-xs text-white/50">Try a demo ID:</span>
        {DEMO_IDS.map((d) => (
          <button
            key={d.code}
            type="button"
            onClick={() => lookup(d.code)}
            title={`${d.title} · ${STAGES[d.stage].label}`}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-white/80 transition hover:border-brand/60 hover:bg-brand/10 hover:text-white"
          >
            {d.code}
          </button>
        ))}
      </div>
      )}
    </form>
  );
}

function OtpStep({ project, onBack, onVerified }: { project: Project; onBack: () => void; onVerified: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(30);
  const shake = useAnimationControls();
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const verify = (code: string) => {
    setBusy(true);
    setError("");
    window.setTimeout(() => {
      if (code === DEMO_OTP) {
        onVerified();
        return;
      }
      setBusy(false);
      shake.start({ x: [0, -10, 10, -7, 7, -3, 0], transition: { duration: 0.45 } });
      setError("That code isn't right. Please check the message and try again.");
      setDigits(Array(6).fill(""));
      refs.current[0]?.focus();
    }, 900);
  };

  const fill = (start: number, str: string) => {
    const next = [...digits];
    let i = start;
    for (const ch of str) {
      if (i > 5) break;
      next[i++] = ch;
    }
    setDigits(next);
    refs.current[Math.min(i, 5)]?.focus();
    if (next.every(Boolean)) verify(next.join(""));
  };

  const onChange = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, "");
    if (error) setError("");
    if (!v) {
      const next = [...digits];
      next[i] = "";
      setDigits(next);
      return;
    }
    fill(i, v.length > 1 ? v : v.slice(-1));
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      const next = [...digits];
      next[i - 1] = "";
      setDigits(next);
      refs.current[i - 1]?.focus();
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
  };

  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-display font-semibold text-white">
            <ShieldCheck className="size-5 text-teal" /> Confirm it&apos;s you
          </p>
          <p className="mt-1 text-sm text-white/60">
            We sent a 6-digit code to <span className="text-white">{project.client.emailMasked}</span> and{" "}
            <span className="whitespace-nowrap text-white">{project.client.phoneMasked}</span>
          </p>
        </div>
        <button onClick={onBack} className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs text-white/60 hover:text-white">
          <ArrowLeft className="size-3.5" /> Change ID
        </button>
      </div>

      <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1 font-mono text-xs text-white/70">
        {project.code}
      </p>

      <motion.div
        animate={shake}
        className="mt-4 flex gap-2 sm:gap-3"
        onPaste={(e) => {
          const text = e.clipboardData.getData("text").replace(/\D/g, "");
          if (text) {
            e.preventDefault();
            fill(0, text);
          }
        }}
      >
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onFocus={(e) => e.target.select()}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={6}
            disabled={busy}
            aria-label={`Digit ${i + 1}`}
            className={cn(
              "h-14 w-full min-w-0 rounded-xl border-2 bg-white text-center font-display text-2xl font-bold text-navy outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/25 disabled:opacity-60",
              error ? "border-danger/70" : d ? "border-teal" : "border-transparent",
            )}
          />
        ))}
      </motion.div>

      <div className="mt-3 min-h-6 text-sm" aria-live="polite">
        {busy ? (
          <span className="flex items-center gap-2 text-white/70">
            <Loader2 className="size-4 animate-spin" /> Verifying and loading your project…
          </span>
        ) : error ? (
          <span className="flex items-center gap-2 text-[#ffb4a8]">
            <AlertCircle className="size-4" /> {error}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs">
        <button
          onClick={() => fill(0, DEMO_OTP)}
          disabled={busy}
          className="rounded-full bg-teal/15 px-3 py-1.5 font-bold text-teal transition hover:bg-teal/25"
        >
          Demo: use code {DEMO_OTP}
        </button>
        <button
          disabled={resendIn > 0 || busy}
          onClick={() => setResendIn(30)}
          className="text-white/60 hover:text-white disabled:cursor-default disabled:hover:text-white/60"
        >
          {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
        </button>
      </div>
    </div>
  );
}

function DoneStep({ project, onReset }: { project: Project; onReset: () => void }) {
  return (
    <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
      <motion.span
        initial={{ scale: 0, rotate: -45 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 15 }}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-teal/15"
      >
        <CheckCircle2 className="size-6 text-teal" />
      </motion.span>
      <div className="min-w-0 flex-1">
        <p className="font-display font-semibold text-white">Verified: {project.title}</p>
        <p className="text-sm text-white/60">
          <span className="font-mono">{project.code}</span> · {STAGES[project.stage].label} · {project.progress}%
        </p>
      </div>
      <div className="flex gap-2">
        <a
          href="#status"
          className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
        >
          View status <ArrowDown className="size-4" />
        </a>
        <button onClick={onReset} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/80 hover:bg-white/5">
          Track another
        </button>
      </div>
    </div>
  );
}

const IDEA_MESSAGES: Record<Idea["status"], string> = {
  DRAFT: "This application isn't submitted yet. Use the link we emailed you to finish it and fund your project wallet.",
  NEW: "We've received your idea. Our team will start reviewing it shortly.",
  REVIEWING: "Our engineers are assessing your idea and choosing the right tech stack.",
  QUOTE_SENT: "We've emailed you a proposal and quote. Accept it online and we'll register your project straight away.",
  ACCEPTED: "Your project is registered! We sent your Project ID by email and SMS.",
  DECLINED: "We're not able to take on this idea right now. Check your email for details.",
};

/** Commitment fee status for the idea tracker. */
function FeeLine({ idea }: { idea: Idea }) {
  const paid = paidPayment(idea);
  const state = feeState(idea);
  const text = paid?.refund
    ? paid.refund.status === "REFUNDED"
      ? `Your ${formatPrice(paid.amount, paid.currency)} commitment fee was refunded.`
      : `Your ${formatPrice(paid.amount, paid.currency)} commitment fee is being refunded.`
    : state === "PAID"
      ? `Commitment fee paid · receipt ${paid?.receiptNo}`
      : state === "AWAITING_CONFIRMATION"
        ? "We're confirming your commitment fee transfer."
        : idea.status === "DRAFT"
          ? "Commitment fee not paid yet."
          : null;
  if (!text) return null;
  return (
    <p className="mt-3 flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs text-white/70">
      <Wallet className="size-4 shrink-0 text-brand" /> {text}
    </p>
  );
}

function IdeaStep({ result, onBack, onTrack }: { result: { idea: Idea; project?: Project }; onBack: () => void; onTrack: (p: Project) => void }) {
  const { idea, project } = result;
  const steps: Idea["status"][] = ["NEW", "REVIEWING", "QUOTE_SENT", "ACCEPTED"];
  const current = steps.indexOf(idea.status);
  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-display font-semibold text-white">
            <Lightbulb className="size-5 text-brand" /> {idea.title}
          </p>
          <p className="mt-0.5 font-mono text-xs text-white/50">{idea.ref}</p>
        </div>
        <button onClick={onBack} className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs text-white/60 hover:text-white">
          <ArrowLeft className="size-3.5" /> Back
        </button>
      </div>

      {idea.status === "DECLINED" || idea.status === "DRAFT" ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-white/5 p-3 text-sm text-white/80">
          {idea.status === "DRAFT" ? <Clock className="size-5 shrink-0 text-brand" /> : <XCircle className="size-5 shrink-0 text-[#ffb4a8]" />} {IDEA_MESSAGES[idea.status]}
        </p>
      ) : (
        <>
          <ol className="mt-4 grid grid-cols-4 gap-1.5">
            {steps.map((st, i) => (
              <li key={st}>
                <div className={cn("h-1.5 rounded-full", i <= current ? (i === 3 ? "bg-teal" : "bg-brand") : "bg-white/15")} />
                <p className={cn("mt-1.5 text-[10px] leading-tight sm:text-[11px]", i <= current ? "font-bold text-white" : "text-white/45")}>{IDEA_STATUSES[st].label}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-start gap-2 text-sm text-white/80">
            {idea.status === "ACCEPTED" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal" /> : <Clock className="mt-0.5 size-4 shrink-0 text-brand" />}
            {IDEA_MESSAGES[idea.status]}
          </p>
        </>
      )}

      <FeeLine idea={idea} />

      {idea.status === "QUOTE_SENT" && idea.quote?.status === "sent" && (
        <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-white/50">Your proposal was emailed to you. Demo: open it here.</span>
          <a href={`/quote?ref=${encodeURIComponent(idea.ref)}&token=${encodeURIComponent(idea.quote.token)}`} className="flex items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600">
            Review proposal <ArrowRight className="size-4" />
          </a>
        </div>
      )}
      {project && (
        <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-white/50">Demo: the Project ID from that email is {project.code}</span>
          <button onClick={() => onTrack(project)} className="flex items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600">
            Track project <ArrowRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
