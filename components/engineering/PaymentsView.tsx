"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ChevronDown, Lightbulb, Loader2, Search, Wallet } from "lucide-react";
import { formatPrice } from "@/lib/catalog";
import { usePaymentSettings } from "@/lib/settings";
import { cn, formatDate } from "@/lib/format";
import { IDEA_STATUSES, useIdea } from "@/lib/ideas";
import { FEE_STATES, REFUND_STATES, feeSummary, useStaffPayments, type PaymentFilters, type StaffPayment } from "@/lib/wallet";
import type { Notify } from "../PortalApp";
import PaymentPanel from "./PaymentPanel";

type Tab = "confirm" | "refunds" | "paid" | "all";

const TAB_FILTERS: Record<Tab, PaymentFilters> = {
  confirm: { status: "AWAITING_CONFIRMATION" },
  refunds: { refund: "open" },
  paid: { status: "PAID" },
  all: {},
};

/** Every commitment fee payment and refund, straight from the payments queue. */
export default function PaymentsView({ notify, onOpenIdea }: { notify: Notify; onOpenIdea: (ideaId: number) => void }) {
  const settings = usePaymentSettings();
  const [tab, setTab] = useState<Tab>("confirm");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { payments, counts, loading, error, refresh } = useStaffPayments({ ...TAB_FILTERS[tab], q: q || undefined });
  const summary = feeSummary(counts, payments);
  const money = (n: number) => formatPrice(n, settings.currency);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "confirm", label: "To confirm", count: summary.awaiting },
    { key: "refunds", label: "Refunds", count: summary.refundsDue + summary.refundsProcessing },
    { key: "paid", label: "Paid", count: summary.paid },
    { key: "all", label: "All" },
  ];

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Payments</h1>
      <p className="mt-1 text-muted">
        {money(settings.commitmentFee)} commitment fees from idea submissions. Change the fee, bank account and Paystack keys under Settings.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Collected" value={money(summary.collected)} hint="Confirmed fees, before refunds" />
        <Stat label="Refunded" value={money(summary.refunded)} hint={`Net ${money(summary.net)} · from the payments listed here`} />
        <Stat label="Transfers to confirm" value={String(summary.awaiting)} hint="Clients said they paid" highlight={summary.awaiting > 0} />
        <Stat label="Refunds to send" value={String(summary.refundsDue)} hint={`${summary.refundsProcessing} with Paystack`} highlight={summary.refundsDue > 0} />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
          <Search className="size-4 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, reference or receipt"
            aria-label="Search payments"
            className="h-full w-full bg-transparent text-sm outline-none"
          />
          {loading && <Loader2 className="size-4 shrink-0 animate-spin text-brand" />}
        </div>
      </div>

      <div role="tablist" aria-label="Payment filters" className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setOpen(null);
            }}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition", tab === t.key ? "bg-navy text-white" : "bg-white text-muted hover:text-navy")}
          >
            {t.label} {t.count !== undefined && <span className="opacity-60">{t.count}</span>}
          </button>
        ))}
      </div>

      <p className="mt-2 text-xs text-muted" role="status" aria-live="polite">
        {loading ? "Loading payments…" : `${payments.length} payment${payments.length === 1 ? "" : "s"}${q ? ` matching “${q}”` : ""}`}
      </p>

      <ul className="mt-3 space-y-2.5">
        {payments.map((payment) => {
          const expanded = open === payment.id;
          return (
            <li key={payment.id} className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
              <button onClick={() => setOpen(expanded ? null : payment.id)} aria-expanded={expanded} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-4 text-left">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-700">
                  <Wallet className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display font-semibold">{payment.idea.title || "Untitled idea"}</span>
                  <span className="block truncate text-xs text-muted">
                    {payment.idea.name ?? payment.idea.email} · <span className="font-mono">{payment.idea.ref}</span> · {methodLabel(payment)}
                    {payment.reference ? ` · ${payment.reference}` : ""}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-bold">{formatPrice(payment.amount, payment.currency)}</span>
                  <span className="block text-xs text-muted">{payment.paidAt || payment.createdAt ? formatDate((payment.paidAt ?? payment.createdAt) as string) : "—"}</span>
                </span>
                <Status payment={payment} />
                <ChevronDown className={cn("size-4 text-muted transition", expanded && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="border-t border-line px-4 pb-4">
                      <ExpandedIdea ideaId={payment.idea.id} notify={notify} onOpenIdea={onOpenIdea} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}

        {loading && payments.length === 0 && (
          <li className="rounded-2xl border border-dashed border-line bg-white py-14 text-center text-sm text-muted" role="status" aria-live="polite">
            <Loader2 className="mx-auto mb-2 size-6 animate-spin text-brand" /> Loading the payments queue…
          </li>
        )}
        {!loading && error && (
          <li className="rounded-2xl border border-line bg-white py-12 text-center" role="alert">
            <AlertTriangle className="mx-auto size-7 text-danger" />
            <p className="mt-2 text-sm font-bold">We couldn&apos;t load the payments.</p>
            <p className="mt-1 px-4 text-sm text-muted">{error}</p>
            <button onClick={() => void refresh()} className="mt-3 rounded-full border border-line px-4 py-2 text-sm font-bold hover:border-navy">
              Try again
            </button>
          </li>
        )}
        {!loading && !error && payments.length === 0 && (
          <li className="rounded-2xl border border-dashed border-line bg-white py-14 text-center text-sm text-muted">
            <Wallet className="mx-auto mb-2 size-8 text-line" /> Nothing here right now.
          </li>
        )}
      </ul>
    </div>
  );
}

/** One idea, loaded when its payment row is opened, so the panel has the whole wallet. */
function ExpandedIdea({ ideaId, notify, onOpenIdea }: { ideaId: number; notify: Notify; onOpenIdea: (ideaId: number) => void }) {
  const { data: idea, loading, error, refresh } = useIdea(ideaId);

  if (loading && !idea)
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted" role="status" aria-live="polite">
        <Loader2 className="size-4 animate-spin text-brand" /> Loading this idea…
      </p>
    );

  if (!idea)
    return (
      <div className="py-6 text-center" role="alert">
        <AlertTriangle className="mx-auto size-6 text-danger" />
        <p className="mt-2 text-sm text-muted">{error ?? "We couldn't load this idea."}</p>
        <button onClick={() => void refresh()} className="mt-2 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-navy">
          Try again
        </button>
      </div>
    );

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted">
          Idea status: <b className="text-navy">{IDEA_STATUSES[idea.status].label}</b> · {idea.email}
        </span>
        <button onClick={() => onOpenIdea(idea.id)} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-navy">
          <Lightbulb className="size-3.5" /> Open idea
        </button>
      </div>
      <PaymentPanel idea={idea} notify={notify} />
    </>
  );
}

const methodLabel = (p: StaffPayment) => (p.method === "manual" && p.recordedBy ? "At centre" : p.method === "paystack" ? "Paystack" : p.method === "manual" ? "Bank transfer" : "—");

function Status({ payment }: { payment: StaffPayment }) {
  const meta =
    payment.refund.status !== "NONE"
      ? REFUND_STATES[payment.refund.status]
      : payment.status === "FAILED"
        ? { label: "Not received", className: "bg-danger-soft text-danger" }
        : FEE_STATES[payment.status];
  return <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", meta.className)}>{meta.label}</span>;
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
