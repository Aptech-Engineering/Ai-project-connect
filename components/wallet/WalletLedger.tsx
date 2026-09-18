"use client";

import { ArrowDownLeft, ArrowUpRight, Clock, Receipt } from "lucide-react";
import { formatPrice } from "@/lib/catalog";
import { cn, formatDate } from "@/lib/format";
import type { Idea } from "@/lib/ideas";
import { walletBalance, walletLedger } from "@/lib/wallet";

/** The client's wallet transactions: commitment fee payments and refunds. */
export default function WalletLedger({ idea, compact }: { idea: Idea; compact?: boolean }) {
  const entries = walletLedger(idea);
  const currency = idea.payments?.[0]?.currency ?? "NGN";
  if (entries.length === 0) return <p className="rounded-xl bg-mist px-4 py-3 text-sm text-muted">No wallet transactions yet.</p>;
  return (
    <div>
      {!compact && (
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Balance</p>
          <p className="font-display text-xl font-bold">{formatPrice(walletBalance(idea), currency)}</p>
        </div>
      )}
      <p className={cn("text-xs font-bold uppercase tracking-wider text-muted", !compact && "mt-3")}>Transactions</p>
      <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
        {entries.map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-3.5 py-3">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-full",
                e.tone === "good" ? "bg-teal-soft text-teal-700" : e.tone === "bad" ? "bg-danger-soft text-danger" : e.tone === "wait" ? "bg-brand-soft text-brand-700" : "bg-mist text-muted",
              )}
            >
              {e.label === "Refund" ? <ArrowUpRight className="size-4" /> : e.tone === "wait" ? <Clock className="size-4" /> : e.tone === "good" ? <ArrowDownLeft className="size-4" /> : <Receipt className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{e.label}</span>
              <span className="block truncate text-xs text-muted">{e.detail}</span>
            </span>
            <span className="text-right">
              <span className={cn("block text-sm font-bold", e.direction === 0 && "text-muted")}>
                {e.direction === -1 ? "−" : e.direction === 1 ? "+" : ""}
                {formatPrice(e.amount, e.currency)}
              </span>
              <span className="block text-xs text-muted">
                {e.status} · {formatDate(e.at, { day: "numeric", month: "short" })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
