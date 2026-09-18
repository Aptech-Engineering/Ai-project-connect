"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Copy, FileText, Loader2, Lock, ReceiptText, Send, UploadCloud, X } from "lucide-react";
import { sendQuote, withdrawQuote, type Quote } from "@/lib/flows";
import { paymentBlocker } from "@/lib/wallet";
import { errorMessage } from "@/lib/api";
import { CURRENCIES, formatPrice } from "@/lib/catalog";
import { formatBytes, openRemoteFile, validatePdf } from "@/lib/files";
import { activeLeads, useStaff, useStaffUsers, type StaffUser } from "@/lib/staff";
import { cn, formatDate, relativeDay } from "@/lib/format";
import type { Idea } from "@/lib/ideas";
import type { Notify } from "../PortalApp";
import { apiPath } from "./helpers";

const inputClass = "h-10 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";
const dateIn = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const QUOTE_STATUS = {
  sent: { label: "Waiting for client", className: "bg-brand-soft text-brand-700" },
  accepted: { label: "Accepted online", className: "bg-teal text-white" },
  declined: { label: "Declined by client", className: "bg-danger-soft text-danger" },
  withdrawn: { label: "Withdrawn", className: "bg-line text-muted" },
} as const;

/** Send a quote with a proposal PDF; the client accepts online and the project registers itself. */
export default function QuotePanel({ idea, notify }: { idea: Idea; notify: Notify }) {
  const me = useStaff();
  const leads = activeLeads(useStaffUsers());
  const [open, setOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  /** The private link, which the server only returns once, just after sending. */
  const [freshLink, setFreshLink] = useState<string | null>(null);

  const quote: Quote | null = idea.quote;
  const canQuote = !idea.projectCode && idea.status !== "DECLINED" && idea.status !== "DRAFT" && (me.role === "admin" || me.role === "lead");
  const blocker = paymentBlocker(idea);
  const client = idea.name ?? "the client";

  const withdraw = async () => {
    if (!quote || withdrawing) return;
    setWithdrawing(true);
    try {
      await withdrawQuote(quote.id);
      setFreshLink(null);
      notify("Quote withdrawn. The idea is back in review.", "info");
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="mt-5 rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display font-semibold">
          <ReceiptText className="size-5 text-brand" /> Quote
        </p>
        {quote && (
          <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase", quote.expired ? "bg-line text-muted" : QUOTE_STATUS[quote.status].className)}>
            {quote.expired ? "Expired" : QUOTE_STATUS[quote.status].label}
          </span>
        )}
      </div>

      {quote && !open && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="font-display text-2xl font-bold">{formatPrice(quote.amount, quote.currency)}</p>
          <p className="text-navy/80">{quote.summary}</p>
          <p className="text-xs text-muted">
            {quote.timelineWeeks ? `About ${quote.timelineWeeks} weeks · ` : ""}
            {quote.leadName ? `Lead ${quote.leadName} · ` : ""}
            {quote.targetDate ? `delivery ${formatDate(quote.targetDate)} · ` : ""}valid until {formatDate(quote.validUntil)}
            {quote.sentAt ? ` · sent ${relativeDay(quote.sentAt).toLowerCase()}` : ""}
          </p>
          {quote.status === "accepted" && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-teal-700">
              <CheckCircle2 className="size-4" /> Accepted by {quote.acceptedName ?? client}
              {quote.respondedAt ? ` ${relativeDay(quote.respondedAt).toLowerCase()}` : ""} — project registered automatically.
            </p>
          )}
          {quote.status === "declined" && <p className="text-xs text-danger">Client note: {quote.clientNote || "No reason given."}</p>}

          <div className="flex flex-wrap gap-2 pt-1">
            {quote.proposal && (
              <button
                onClick={() => {
                  const path = apiPath(quote.proposal?.url);
                  if (path) void openRemoteFile(path, quote.proposal?.name ?? "proposal.pdf", "view").then((ok) => ok || notify("We couldn't open that file.", "info"));
                }}
                className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-navy"
              >
                <FileText className="size-3.5" /> {quote.proposal.name}
              </button>
            )}
            {quote.status === "sent" && (
              <button onClick={() => void withdraw()} disabled={withdrawing} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-muted hover:text-danger disabled:opacity-50">
                {withdrawing && <Loader2 className="size-3.5 animate-spin" />} Withdraw
              </button>
            )}
          </div>

          {quote.status === "sent" && (
            <p className="rounded-xl bg-mist px-3 py-2 text-xs text-muted">
              {client} has the private link by email. We can&apos;t show it again — it&apos;s stored scrambled — so send a revised quote if they need a new one.
            </p>
          )}

          {freshLink && (
            <div className="rounded-xl border border-brand/30 bg-brand-soft/40 p-3">
              <p className="text-xs font-bold">Client link (this screen only, on a test server)</p>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2.5 py-1.5 font-mono text-[11px]">{freshLink}</code>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(freshLink).catch(() => {});
                    notify("Client quote link copied.", "info");
                  }}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11px] font-bold hover:border-navy"
                >
                  <Copy className="size-3" /> Copy
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!quote && !open && <p className="mt-2 text-sm text-muted">Send a price and proposal. When the client accepts online, the project is registered and they get their Project ID automatically.</p>}

      <AnimatePresence initial={false}>
        {open ? (
          <QuoteForm
            key="form"
            idea={idea}
            leads={leads}
            onCancel={() => setOpen(false)}
            onSent={(devLink) => {
              setOpen(false);
              setFreshLink(devLink ?? null);
            }}
            notify={notify}
          />
        ) : (
          canQuote &&
          quote?.status !== "accepted" &&
          (blocker ? (
            <p key="blocked" className="mt-3 flex items-start gap-2 rounded-xl bg-mist px-3 py-2.5 text-xs text-muted">
              <Lock className="mt-0.5 size-3.5 shrink-0" /> {blocker}
            </p>
          ) : (
            <motion.button
              key="btn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => setOpen(true)}
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-navy text-sm font-bold text-white hover:bg-navy-700"
            >
              <Send className="size-4" /> {quote ? "Send a revised quote" : "Send quote"}
            </motion.button>
          ))
        )}
      </AnimatePresence>
    </div>
  );
}

function QuoteForm({
  idea,
  leads,
  onCancel,
  onSent,
  notify,
}: {
  idea: Idea;
  leads: StaffUser[];
  onCancel: () => void;
  onSent: (devLink?: string) => void;
  notify: Notify;
}) {
  const me = useStaff();
  const quote = idea.quote;
  const [amount, setAmount] = useState(quote?.amount?.toString() ?? "");
  const [currency, setCurrency] = useState(quote?.currency ?? "NGN");
  const [summary, setSummary] = useState(quote?.summary ?? "");
  const [weeks, setWeeks] = useState(quote?.timelineWeeks?.toString() ?? "");
  const [validUntil, setValidUntil] = useState(dateIn(14));
  // The server wants the lead's staff id, not their name.
  const [leadId, setLeadId] = useState<number | "">(() => leads.find((u) => u.name === quote?.leadName)?.id ?? leads.find((u) => u.id !== me.id)?.id ?? leads[0]?.id ?? "");
  const [targetDate, setTargetDate] = useState(dateIn(90));
  const [proposal, setProposal] = useState<File | undefined>();
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const attach = async (file?: File) => {
    if (!file) return;
    const problem = await validatePdf(file);
    if (problem) return setError(problem);
    setProposal(file);
    setError("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const value = Number(amount);
    if (!value || value <= 0) return setError("Enter the quote amount.");
    if (summary.trim().length < 20) return setError("Describe what's included (at least a sentence).");
    if (validUntil < today) return setError("The quote must be valid until a future date.");
    if (targetDate <= today) return setError("Choose a delivery date in the future.");
    if (leadId === "") return setError("Choose the project lead.");

    setError("");
    setSending(true);
    try {
      const sent = await sendQuote(idea.id, {
        amount: value,
        currency,
        summary: summary.trim(),
        timelineWeeks: weeks ? Number(weeks) : undefined,
        validUntil,
        leadId,
        targetDate,
        proposal,
      });
      notify(`Quote sent to ${idea.name ?? idea.email} by email with a private link to accept online.`);
      onSent(sent.devLink);
    } catch (err) {
      // The server refuses a quote until the commitment fee is confirmed (409).
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} onSubmit={submit} className="mt-3 space-y-3 overflow-hidden" noValidate>
      <div className="grid grid-cols-[1fr_100px] gap-2">
        <label className="text-xs font-bold">
          Amount
          <input type="number" min={0} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} className={cn(inputClass, "mt-1 font-normal")} />
        </label>
        <label className="text-xs font-bold">
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={cn(inputClass, "mt-1 font-normal")}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs font-bold">
        What&apos;s included
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          placeholder="Screens, features, platforms, support included…"
          className="mt-1 w-full resize-none rounded-xl border border-line px-3 py-2 text-sm font-normal outline-none focus:border-brand"
        />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs font-bold">
          Weeks
          <input type="number" min={1} value={weeks} onChange={(e) => setWeeks(e.target.value)} className={cn(inputClass, "mt-1 font-normal")} />
        </label>
        <label className="text-xs font-bold">
          Valid until
          <input type="date" value={validUntil} min={today} onChange={(e) => setValidUntil(e.target.value)} className={cn(inputClass, "mt-1 px-2 font-normal")} />
        </label>
        <label className="text-xs font-bold">
          Delivery
          <input type="date" value={targetDate} min={today} onChange={(e) => setTargetDate(e.target.value)} className={cn(inputClass, "mt-1 px-2 font-normal")} />
        </label>
      </div>
      <label className="block text-xs font-bold">
        Project lead (if accepted)
        <select value={leadId} onChange={(e) => setLeadId(e.target.value ? Number(e.target.value) : "")} className={cn(inputClass, "mt-1 font-normal")}>
          {leads.length === 0 && <option value="">No project leads available</option>}
          {leads.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      {proposal ? (
        <div className="flex items-center gap-2 rounded-xl bg-mist px-3 py-2 text-sm">
          <FileText className="size-4 text-danger" />
          <span className="flex-1 truncate font-bold">{proposal.name}</span>
          <span className="text-xs text-muted">{formatBytes(proposal.size)}</span>
          <button type="button" onClick={() => setProposal(undefined)} aria-label="Remove proposal" className="rounded p-1 text-muted hover:text-danger">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-line px-3 py-2.5 text-sm hover:border-brand/40">
          <UploadCloud className="size-4 text-brand" />
          <span className="font-bold">Attach proposal PDF</span>
          <span className="text-xs text-muted">(optional · uploaded when you send)</span>
          <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => void attach(e.target.files?.[0])} />
        </label>
      )}
      <p role="status" aria-live="polite" className={cn("text-xs font-bold text-danger", !error && "sr-only")}>
        {sending ? "Sending the quote…" : error}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={sending} className="h-10 flex-1 rounded-xl border border-line text-sm font-bold text-muted disabled:opacity-50">
          Cancel
        </button>
        <button disabled={sending} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {sending ? "Sending…" : "Email quote to client"}
        </button>
      </div>
    </motion.form>
  );
}
