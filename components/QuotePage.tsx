"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowRight, CalendarClock, CheckCircle2, Clock, FileText, Loader2, ShieldCheck, UserRound, XCircle } from "lucide-react";
import Logo from "./Logo";
import { acceptQuote, declineQuote, openQuote, type QuoteLookup } from "@/lib/flows";
import { formatPrice } from "@/lib/catalog";
import { openStoredFile } from "@/lib/files";
import { cn, formatDate } from "@/lib/format";

/** Private page the client opens from the quote email: review, accept online or decline. */
export default function QuotePage() {
  const params = useSearchParams();
  const ref = params.get("ref") ?? "";
  const token = params.get("token") ?? "";
  const [lookup, setLookup] = useState<QuoteLookup | null>(null);
  const [mode, setMode] = useState<"review" | "decline">("review");
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ kind: "accepted"; code: string; sentTo: string } | { kind: "declined" } | null>(null);

  useEffect(() => setLookup(openQuote(ref, token)), [ref, token]);

  const accept = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2 || !agree) return;
    setBusy(true);
    window.setTimeout(() => {
      const res = acceptQuote(ref, token, name.trim());
      setBusy(false);
      if (!res.ok) return setError(res.error);
      setResult({ kind: "accepted", code: res.code, sentTo: res.sentTo });
    }, 900);
  };

  const decline = (e: React.FormEvent) => {
    e.preventDefault();
    const res = declineQuote(ref, token, reason.trim() || undefined);
    if (!res.ok) return setError(res.error);
    setResult({ kind: "declined" });
  };

  return (
    <div className="min-h-screen bg-mist">
      <header className="bg-navy">
        <div className="container-page flex h-16 items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <span className="flex items-center gap-1.5 text-xs text-white/60">
            <ShieldCheck className="size-4 text-teal" /> Private proposal link
          </span>
        </div>
      </header>

      <main className="container-page max-w-3xl py-10 sm:py-14">
        {lookup === null ? (
          <div className="grid h-64 place-items-center">
            <Loader2 className="size-8 animate-spin text-brand" />
          </div>
        ) : !lookup.ok ? (
          <Message icon={<AlertCircle className="size-10 text-danger" />} title="We couldn't open this proposal" text={lookup.error} />
        ) : result?.kind === "accepted" ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-white p-8 text-center shadow-xl shadow-navy/5">
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14 }} className="mx-auto grid size-20 place-items-center rounded-full bg-teal-soft">
              <CheckCircle2 className="size-11 text-teal" />
            </motion.span>
            <h1 className="mt-5 font-display text-3xl font-bold">Welcome aboard!</h1>
            <p className="mt-2 text-muted">
              Your project <b className="text-navy">{lookup.idea.title}</b> is registered. We&apos;ve sent your Project ID to <b className="text-navy">{result.sentTo}</b> and by SMS.
            </p>
            <p className="mx-auto mt-5 max-w-sm rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand-700">
              Demo: your Project ID is <b className="font-mono">{result.code}</b>
            </p>
            <Link href="/#track" className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-navy px-6 font-bold text-white hover:bg-navy-700">
              Track your project <ArrowRight className="size-4" />
            </Link>
          </motion.div>
        ) : result?.kind === "declined" ? (
          <Message icon={<XCircle className="size-10 text-muted" />} title="Thanks for letting us know" text="Your team will be in touch to talk through options or a revised proposal." />
        ) : (
          <QuoteView lookup={lookup}>
            {lookup.quote.status !== "sent" || lookup.expired ? (
              <p className="rounded-2xl bg-mist px-4 py-3 text-sm text-muted">
                {lookup.quote.status === "accepted"
                  ? "You've already accepted this proposal. Check your email for your Project ID."
                  : lookup.expired
                    ? "This proposal has expired. Contact us for an updated quote."
                    : "This proposal is no longer open. Contact us for an updated quote."}
              </p>
            ) : (
              <AnimatePresence mode="wait">
                {mode === "review" ? (
                  <motion.form key="accept" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onSubmit={accept} className="space-y-4">
                    <label className="flex items-start gap-2.5 text-sm">
                      <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-brand)]" />
                      I accept this proposal and price, and agree to the project terms (including NDA and IP ownership as discussed).
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Type your full name to accept" aria-label="Your full name" className="h-12 flex-1 rounded-xl border border-line px-4 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
                      <button disabled={busy || name.trim().length < 2 || !agree} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 font-bold text-white hover:bg-brand-600 disabled:opacity-40">
                        {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Accept proposal
                      </button>
                    </div>
                    {error && <p className="text-sm font-bold text-danger">{error}</p>}
                    <button type="button" onClick={() => setMode("decline")} className="text-sm text-muted underline underline-offset-2 hover:text-navy">
                      Not right for you? Decline or ask for changes
                    </button>
                  </motion.form>
                ) : (
                  <motion.form key="decline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onSubmit={decline} className="space-y-3">
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Tell us what would work better (budget, scope, timing)…" aria-label="Reason" className="w-full resize-none rounded-xl border border-line p-3 text-sm outline-none focus:border-brand" />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setMode("review")} className="h-11 flex-1 rounded-xl border border-line font-bold text-muted">
                        Back
                      </button>
                      <button className="h-11 flex-1 rounded-xl bg-navy font-bold text-white">Decline proposal</button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            )}
          </QuoteView>
        )}
      </main>
    </div>
  );
}

function QuoteView({ lookup, children }: { lookup: Extract<QuoteLookup, { ok: true }>; children: React.ReactNode }) {
  const { idea, quote } = lookup;
  return (
    <motion.article initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-navy/5">
      <div className="h-1.5 bg-gradient-to-r from-brand to-teal" />
      <div className="p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Proposal for {idea.name}</p>
        <h1 className="mt-1 font-display text-3xl font-bold">{idea.title}</h1>
        <p className="mt-1 font-mono text-xs text-muted">{idea.ref}</p>

        <div className="mt-6 rounded-2xl bg-navy p-5 text-white">
          <p className="text-sm text-white/60">Total project price</p>
          <p className="font-display text-4xl font-extrabold">{formatPrice(quote.amount, quote.currency)}</p>
        </div>

        <p className="mt-6 whitespace-pre-line leading-relaxed text-navy/85">{quote.summary}</p>

        <dl className="mt-6 grid gap-3 sm:grid-cols-3">
          <Fact icon={<Clock className="size-4" />} label="Timeline" value={quote.timelineWeeks ? `About ${quote.timelineWeeks} weeks` : "To be agreed"} />
          <Fact icon={<CalendarClock className="size-4" />} label="Target delivery" value={formatDate(quote.targetDate)} />
          <Fact icon={<UserRound className="size-4" />} label="Your project lead" value={quote.leadName} />
        </dl>

        {quote.proposal && (
          <button onClick={() => openStoredFile(quote.proposal!.id, quote.proposal!.name, "view")} className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-line p-3 text-left transition hover:border-navy/30">
            <span className="grid size-10 place-items-center rounded-xl bg-danger-soft text-danger">
              <FileText className="size-5" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-bold">{quote.proposal.name}</span>
              <span className="block text-xs text-muted">Full proposal document</span>
            </span>
            <ArrowRight className="size-4 text-muted" />
          </button>
        )}

        <p className={cn("mt-5 text-xs", lookup.expired ? "font-bold text-danger" : "text-muted")}>Valid until {formatDate(quote.validUntil)}</p>
        <div className="mt-6 border-t border-line pt-6">{children}</div>
      </div>
    </motion.article>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-mist px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        {icon} {label}
      </dt>
      <dd className="mt-0.5 text-sm font-bold">{value}</dd>
    </div>
  );
}

function Message({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-3xl bg-white p-10 text-center shadow-xl shadow-navy/5">
      <span className="mx-auto block w-fit">{icon}</span>
      <h1 className="mt-4 font-display text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-muted">{text}</p>
      <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-navy px-5 font-bold text-white">
        Go to homepage
      </Link>
    </div>
  );
}
