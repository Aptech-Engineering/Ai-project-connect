"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { AlertCircle, ArrowDown, ArrowLeft, ArrowRight, CheckCircle2, Clock, Lightbulb, Loader2, Lock, Search, ShieldCheck, XCircle } from "lucide-react";
import { STAGES } from "@/lib/data";
import { requestClientCode, verifyClientCode } from "@/lib/store";
import { lookupIdea } from "@/lib/actions";
import { ApiError, errorMessage } from "@/lib/api";
import { track } from "@/lib/track";
import { IDEA_STATUSES, type IdeaStatus } from "@/lib/ideas";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/format";
import { useSiteContent } from "@/lib/content";

/** What the public idea-status endpoint returns: no payment or quote details. */
export interface PublicIdea {
  ref: string;
  title: string;
  status: IdeaStatus;
  submittedAt?: string | null;
  projectRegistered?: boolean;
}

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
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [idea, setIdea] = useState<PublicIdea | null>(null);
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
                onTrack={(candidateFromIdea) => {
                  setIdea(null);
                  setCandidate(candidateFromIdea);
                }}
              />
            </motion.div>
          )}
          {step === "otp" && candidate && (
            <motion.div key="otp" {...panel}>
              <OtpStep candidate={candidate} onBack={() => setCandidate(null)} onVerified={() => onVerified(candidate.code)} />
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

/** A Project ID that exists: the server has sent a one-time code to the client. */
export interface Candidate {
  code: string;
  title?: string;
  sentTo?: { email?: string; phone?: string };
  /** Only outside production, so the demo can show the code. */
  devCode?: string;
}

function IdStep({ onFound, onIdea }: { onFound: (c: Candidate) => void; onIdea: (idea: PublicIdea) => void }) {
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
    void (async () => {
      try {
        if (isIdea) {
          const result = await lookupIdea(id);
          track("tracker_search", null, { kind: "idea", result: "found" });
          onIdea(result);
          return;
        }
        // The server checks the ID exists and sends the one-time code.
        const sent = await requestClientCode(id);
        track("tracker_search", null, { kind: "project", result: "found" });
        track("portal_signin", "code_requested", { step: "code_requested" });
        onFound({ code: id, sentTo: sent.sentTo, devCode: sent.devCode });
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        track("tracker_search", null, { kind: isIdea ? "idea" : "project", result: status === 404 ? "not_found" : status === 429 ? "rate_limited" : "error" });
        fail(errorMessage(err), true);
      } finally {
        setBusy(false);
      }
    })();
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
          data-track="hero_track"
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

    </form>
  );
}

function OtpStep({ candidate, onBack, onVerified }: { candidate: Candidate; onBack: () => void; onVerified: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(30);
  const [devCode, setDevCode] = useState(candidate.devCode);
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
    void (async () => {
      try {
        await verifyClientCode(candidate.code, code);
        track("portal_signin", "verified", { step: "verified" });
        onVerified();
      } catch (err) {
        track("portal_signin", "failed", { step: "failed" });
        setBusy(false);
        shake.start({ x: [0, -10, 10, -7, 7, -3, 0], transition: { duration: 0.45 } });
        setError(errorMessage(err));
        setDigits(Array(6).fill(""));
        refs.current[0]?.focus();
      }
    })();
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
            We sent a 6-digit code to{" "}
            {candidate.sentTo?.email ? (
              <>
                <span className="text-white">{candidate.sentTo.email}</span>
                {candidate.sentTo.phone && (
                  <>
                    {" "}
                    and <span className="whitespace-nowrap text-white">{candidate.sentTo.phone}</span>
                  </>
                )}
              </>
            ) : (
              "the email and phone on this project"
            )}
            .
          </p>
        </div>
        <button onClick={onBack} className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs text-white/60 hover:text-white">
          <ArrowLeft className="size-3.5" /> Change ID
        </button>
      </div>

      <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1 font-mono text-xs text-white/70">
        {candidate.code}
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
        {devCode ? (
          <button onClick={() => fill(0, devCode)} disabled={busy} className="rounded-full bg-teal/15 px-3 py-1.5 font-bold text-teal transition hover:bg-teal/25">
            Demo: use code {devCode}
          </button>
        ) : (
          <span className="text-white/40">The code expires in a few minutes.</span>
        )}
        <button
          disabled={resendIn > 0 || busy}
          onClick={() => {
            setResendIn(30);
            setError("");
            void requestClientCode(candidate.code)
              .then((sent) => sent.devCode && setDevCode(sent.devCode))
              .catch((err) => setError(errorMessage(err)));
          }}
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

const IDEA_MESSAGES: Record<PublicIdea["status"], string> = {
  DRAFT: "This application isn't submitted yet. Use the link we emailed you to finish it and fund your project wallet.",
  NEW: "We've received your idea. Our team will start reviewing it shortly.",
  REVIEWING: "Our engineers are assessing your idea and choosing the right tech stack.",
  QUOTE_SENT: "We've emailed you a proposal and quote. Accept it online and we'll register your project straight away.",
  ACCEPTED: "Your project is registered! We sent your Project ID by email and SMS.",
  DECLINED: "We're not able to take on this idea right now. Check your email for details.",
};

function IdeaStep({ result, onBack, onTrack }: { result: PublicIdea; onBack: () => void; onTrack: (c: Candidate) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const steps: PublicIdea["status"][] = ["NEW", "REVIEWING", "QUOTE_SENT", "ACCEPTED"];
  const current = steps.indexOf(result.status);

  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-display font-semibold text-white">
            <Lightbulb className="size-5 text-brand" /> {result.title || "Your idea"}
          </p>
          <p className="mt-0.5 font-mono text-xs text-white/50">{result.ref}</p>
        </div>
        <button onClick={onBack} className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs text-white/60 hover:text-white">
          <ArrowLeft className="size-3.5" /> Back
        </button>
      </div>

      {result.status === "DECLINED" || result.status === "DRAFT" ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-white/5 p-3 text-sm text-white/80">
          {result.status === "DRAFT" ? <Clock className="size-5 shrink-0 text-brand" /> : <XCircle className="size-5 shrink-0 text-[#ffb4a8]" />} {IDEA_MESSAGES[result.status]}
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
            {result.status === "ACCEPTED" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal" /> : <Clock className="mt-0.5 size-4 shrink-0 text-brand" />}
            {IDEA_MESSAGES[result.status]}
          </p>
        </>
      )}

      {result.projectRegistered && (
        <form
          className="mt-4 border-t border-white/10 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const id = code.trim().toUpperCase();
            if (!/^APC-\d{2}-[A-Z0-9]{5}$/.test(id)) return setError("Project IDs look like APC-26-7KQ9X.");
            setBusy(true);
            setError("");
            void requestClientCode(id)
              .then((sent) => onTrack({ code: id, sentTo: sent.sentTo, devCode: sent.devCode }))
              .catch((err) => setError(errorMessage(err)))
              .finally(() => setBusy(false));
          }}
        >
          <p className="text-xs text-white/50">Your project is registered. Enter the Project ID from your email to track it.</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="APC-26-7KQ9X"
              aria-label="Project ID"
              className="h-11 flex-1 rounded-xl bg-white/10 px-3 font-mono text-sm text-white outline-none placeholder:text-white/30 focus:bg-white/15"
            />
            <button disabled={busy} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Track project
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-[#ffb4a8]">{error}</p>}
        </form>
      )}
    </div>
  );
}
