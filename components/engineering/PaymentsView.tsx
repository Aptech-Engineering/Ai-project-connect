"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Lightbulb, Wallet } from "lucide-react";
import { formatPrice } from "@/lib/catalog";
import { usePaymentSettings } from "@/lib/settings";
import { cn, formatDate } from "@/lib/format";
import { IDEA_STATUSES, useIdeas, type Idea, type IdeaPayment } from "@/lib/ideas";
import { FEE_STATES, REFUND_STATES, feeSummary } from "@/lib/wallet";
import type { Notify } from "../PortalApp";
import PaymentPanel from "./PaymentPanel";

type Tab = "confirm" | "refunds" | "paid" | "all";

/** Every commitment fee payment and refund across ideas. */
export default function PaymentsView({ notify, onOpenIdea }: { notify: Notify; onOpenIdea: (ideaId: string) => void }) {
  const ideas = useIdeas();
  const settings = usePaymentSettings();
  const [tab, setTab] = useState<Tab>("confirm");
  const [open, setOpen] = useState<string | null>(null);
  const summary = feeSummary(ideas);
  const money = (n: number) => formatPrice(n, settings.currency);

  const rows = ideas
    .flatMap((idea) => (idea.payments ?? []).map((payment) => ({ idea, payment })))
    .filter(({ payment }) =>
      tab === "confirm" ? payment.status === "AWAITING_CONFIRMATION" : tab === "refunds" ? Boolean(payment.refund) : tab === "paid" ? payment.status === "PAID" : payment.status !== "PENDING",
    )
    .sort((a, b) => (b.payment.paidAt ?? b.payment.createdAt).localeCompare(a.payment.paidAt ?? a.payment.createdAt));

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "confirm", label: "To confirm", count: summary.awaiting },
    { key: "refunds", label: "Refunds", count: summary.refundsDue },
    { key: "paid", label: "Paid" },
    { key: "all", label: "All" },
  ];

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Payments</h1>
      <p className="mt-1 text-muted">
        {money(settings.commitmentFee)} commitment fees from idea submissions. Change the fee, bank account and Paystack keys under Settings.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Collected" value={money(summary.collected)} hint="All confirmed fees" />
        <Stat label="Refunded" value={money(summary.refunded)} hint={`Net ${money(summary.net)}`} />
        <Stat label="Transfers to confirm" value={String(summary.awaiting)} hint="Clients said they paid" highlight={summary.awaiting > 0} />
        <Stat label="Refunds to complete" value={String(summary.refundsDue)} hint="Declined ideas" highlight={summary.refundsDue > 0} />
      </div>

      <div role="tablist" aria-label="Payment filters" className="no-scrollbar mt-6 flex gap-1.5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition", tab === t.key ? "bg-navy text-white" : "bg-white text-muted hover:text-navy")}
          >
            {t.label} {t.count !== undefined && <span className="opacity-60">{t.count}</span>}
          </button>
        ))}
      </div>

      <ul className="mt-4 space-y-2.5">
        {rows.map(({ idea, payment }) => {
          const key = `${idea.id}:${payment.id}`;
          const expanded = open === key;
          return (
            <li key={key} className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
              <button onClick={() => setOpen(expanded ? null : key)} aria-expanded={expanded} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-4 text-left">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-700">
                  <Wallet className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display font-semibold">{idea.title || "Untitled idea"}</span>
                  <span className="block truncate text-xs text-muted">
                    {idea.name} · <span className="font-mono">{idea.ref}</span> · {method(payment)} · {payment.reference}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-bold">{formatPrice(payment.amount, payment.currency)}</span>
                  <span className="block text-xs text-muted">{formatDate(payment.paidAt ?? payment.createdAt)}</span>
                </span>
                <Status payment={payment} />
                <ChevronDown className={cn("size-4 text-muted transition", expanded && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="border-t border-line px-4 pb-4">
                      <IdeaLine idea={idea} onOpen={() => onOpenIdea(idea.id)} />
                      <PaymentPanel idea={idea} notify={notify} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="rounded-2xl border border-dashed border-line bg-white py-14 text-center text-sm text-muted">
            <Wallet className="mx-auto mb-2 size-8 text-line" /> Nothing here right now.
          </li>
        )}
      </ul>
    </div>
  );
}

const method = (p: IdeaPayment) => (p.atCentre ? "At centre" : p.method === "paystack" ? "Paystack" : "Bank transfer");

function Status({ payment }: { payment: IdeaPayment }) {
  const meta = payment.refund
    ? REFUND_STATES[payment.refund.status]
    : payment.status === "FAILED"
      ? { label: "Not received", className: "bg-danger-soft text-danger" }
      : FEE_STATES[payment.status];
  return <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", meta.className)}>{meta.label}</span>;
}

function IdeaLine({ idea, onOpen }: { idea: Idea; onOpen: () => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-muted">
        Idea status: <b className="text-navy">{IDEA_STATUSES[idea.status].label}</b> · {idea.email}
      </span>
      <button onClick={onOpen} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-navy">
        <Lightbulb className="size-3.5" /> Open idea
      </button>
    </div>
  );
}

function Stat({ label, value, hint, highlight }: { label: string; value: string; hint: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl border bg-white p-4 shadow-sm", highlight ? "border-brand/40" : "border-line")}>
      <p className="text-xs font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}
