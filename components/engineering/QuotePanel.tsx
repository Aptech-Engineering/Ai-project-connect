"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Copy, ExternalLink, FileText, Loader2, Lock, ReceiptText, Send, UploadCloud, X } from "lucide-react";
import { quoteLink, sendQuote, withdrawQuote } from "@/lib/flows";
import { paymentBlocker } from "@/lib/wallet";
import { CURRENCIES, formatPrice } from "@/lib/catalog";
import { formatBytes, openStoredFile, saveFile, validatePdf, type StoredFileMeta } from "@/lib/files";
import { activeLeads, useStaff, useStaffUsers } from "@/lib/staff";
import { cn, formatDate, relativeDay } from "@/lib/format";
import type { Idea } from "@/lib/ideas";
import type { Notify } from "../PortalApp";
import { actingAs } from "./helpers";

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
  const quote = idea.quote;
  const expired = quote?.status === "sent" && quote.validUntil < new Date().toISOString().slice(0, 10);
  const canQuote = !idea.projectCode && idea.status !== "DECLINED" && idea.status !== "DRAFT" && (me.role === "admin" || me.role === "lead");
  const blocker = paymentBlocker(idea);

  return (
    <div className="mt-5 rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display font-semibold">
          <ReceiptText className="size-5 text-brand" /> Quote
        </p>
        {quote && (
          <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase", expired ? "bg-line text-muted" : QUOTE_STATUS[quote.status].className)}>
            {expired ? "Expired" : QUOTE_STATUS[quote.status].label}
          </span>
        )}
      </div>

      {quote && !open && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="font-display text-2xl font-bold">{formatPrice(quote.amount, quote.currency)}</p>
          <p className="text-navy/80">{quote.summary}</p>
          <p className="text-xs text-muted">
            {quote.timelineWeeks ? `About ${quote.timelineWeeks} weeks · ` : ""}Lead {quote.leadName} · delivery {formatDate(quote.targetDate)} · valid until {formatDate(quote.validUntil)} · sent {relativeDay(quote.sentAt).toLowerCase()} by {quote.sentBy}
          </p>
          {quote.status === "accepted" && <p className="flex items-center gap-1.5 text-xs font-bold text-teal-700"><CheckCircle2 className="size-4" /> Accepted by {quote.acceptedName} {quote.respondedAt && relativeDay(quote.respondedAt).toLowerCase()} — project registered automatically.</p>}
          {quote.status === "declined" && <p className="text-xs text-danger">Client note: {quote.clientNote || "No reason given."}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            {quote.proposal && (
              <button onClick={() => openStoredFile(quote.proposal!.id, quote.proposal!.name, "view")} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-navy">
                <FileText className="size-3.5" /> {quote.proposal.name}
              </button>
            )}
            {quote.status === "sent" && (
              <>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(`${window.location.origin}${quoteLink(idea)}`).catch(() => {});
                    notify("Client quote link copied.", "info");
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-navy"
                >
                  <Copy className="size-3.5" /> Copy client link
                </button>
                <a href={quoteLink(idea) ?? "#"} target="_blank" className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-navy">
                  <ExternalLink className="size-3.5" /> Open as client
                </a>
                <button
                  onClick={() => {
                    withdrawQuote(idea, actingAs(me));
                    notify("Quote withdrawn. The idea is back in review.", "info");
                  }}
                  className="rounded-full px-3 py-1.5 text-xs font-bold text-muted hover:text-danger"
                >
                  Withdraw
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {!quote && !open && <p className="mt-2 text-sm text-muted">Send a price and proposal. When the client accepts online, the project is registered and they get their Project ID automatically.</p>}

      <AnimatePresence initial={false}>
        {open ? (
          <QuoteForm key="form" idea={idea} leads={leads.map((u) => u.name)} onCancel={() => setOpen(false)} onSent={() => setOpen(false)} notify={notify} />
        ) : (
          canQuote &&
          quote?.status !== "accepted" &&
          (blocker ? (
            <p key="blocked" className="mt-3 flex items-start gap-2 rounded-xl bg-mist px-3 py-2.5 text-xs text-muted">
              <Lock className="mt-0.5 size-3.5 shrink-0" /> {blocker}
            </p>
          ) : (
            <motion.button key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setOpen(true)} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-navy text-sm font-bold text-white hover:bg-navy-700">
              <Send className="size-4" /> {quote ? "Send a revised quote" : "Send quote"}
            </motion.button>
          ))
        )}
      </AnimatePresence>
    </div>
  );
}

function QuoteForm({ idea, leads, onCancel, onSent, notify }: { idea: Idea; leads: string[]; onCancel: () => void; onSent: () => void; notify: Notify }) {
  const me = useStaff();
  const [amount, setAmount] = useState(idea.quote?.amount?.toString() ?? "");
  const [currency, setCurrency] = useState(idea.quote?.currency ?? "NGN");
  const [summary, setSummary] = useState(idea.quote?.summary ?? "");
  const [weeks, setWeeks] = useState(idea.quote?.timelineWeeks?.toString() ?? "");
  const [validUntil, setValidUntil] = useState(dateIn(14));
  const [leadName, setLeadName] = useState(idea.quote?.leadName ?? leads.find((n) => n !== me.name) ?? leads[0] ?? "");
  const [targetDate, setTargetDate] = useState(dateIn(90));
  const [proposal, setProposal] = useState<StoredFileMeta | undefined>(idea.quote?.proposal);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  const attach = async (file?: File) => {
    if (!file) return;
    const problem = await validatePdf(file);
    if (problem) return setError(problem);
    setUploading(true);
    setProposal(await saveFile(file));
    setUploading(false);
    setError("");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) return setError("Enter the quote amount.");
    if (summary.trim().length < 20) return setError("Describe what's included (at least a sentence).");
    if (validUntil < today) return setError("The quote must be valid until a future date.");
    if (targetDate <= today) return setError("Choose a delivery date in the future.");
    if (!leadName) return setError("Choose the project lead.");
    sendQuote(idea, { amount: value, currency, summary: summary.trim(), timelineWeeks: weeks ? Number(weeks) : undefined, validUntil, leadName, targetDate, proposal }, actingAs(me));
    notify(`Quote sent to ${idea.name} by email with a private link to accept online.`);
    onSent();
  };

  return (
    <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} onSubmit={submit} className="mt-3 space-y-3 overflow-hidden">
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
        What's included
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="Screens, features, platforms, support included…" className="mt-1 w-full resize-none rounded-xl border border-line px-3 py-2 text-sm font-normal outline-none focus:border-brand" />
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
        <select value={leadName} onChange={(e) => setLeadName(e.target.value)} className={cn(inputClass, "mt-1 font-normal")}>
          {leads.map((n) => (
            <option key={n}>{n}</option>
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
          {uploading ? <Loader2 className="size-4 animate-spin text-brand" /> : <UploadCloud className="size-4 text-brand" />}
          <span className="font-bold">Attach proposal PDF</span>
          <span className="text-xs text-muted">(optional)</span>
          <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => attach(e.target.files?.[0])} />
        </label>
      )}
      {error && <p className="text-xs font-bold text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="h-10 flex-1 rounded-xl border border-line text-sm font-bold text-muted">
          Cancel
        </button>
        <button className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-white hover:bg-brand-600">
          <Send className="size-4" /> Email quote to client
        </button>
      </div>
    </motion.form>
  );
}

