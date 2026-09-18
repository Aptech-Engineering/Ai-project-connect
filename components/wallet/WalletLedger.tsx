"use client";

import { ArrowDownLeft, ArrowUpRight, Clock, Receipt } from "lucide-react";
import { formatPrice } from "@/lib/catalog";
import { cn, formatDate } from "@/lib/format";

/** One line of the commitment fee ledger, exactly as the API returns it. */
export interface WalletEntry {
  type: "fee" | "payment" | "refund";
  label: string;
  amount: number;
  currency: string;
  status: string;
  reference?: string | null;
  at?: string | null;
  method?: string | null;
  receiptNo?: string | null;
  note?: string | null;
}

const tone = (e: WalletEntry) => {
  const status = e.status.toUpperCase();
  if (status.includes("PAID") || status.includes("REFUNDED")) return "good";
  if (status.includes("FAIL")) return "bad";
  if (status.includes("AWAIT") || status.includes("PENDING") || status.includes("PROCESS")) return "wait";
  return "muted";
};

/**
 * The ledger lists the fee we charged and, separately, the money that arrived for it.
 * Only the money moves the balance: a received payment in, a completed refund out.
 */
const direction = (e: WalletEntry) => {
  const status = e.status.toUpperCase();
  if (e.type === "refund") return status.includes("REFUNDED") ? -1 : 0;
  if (e.type === "payment") return status.includes("PAID") ? 1 : 0;
  return 0;
};

export function walletBalance(entries: WalletEntry[]) {
  return entries.reduce((sum, e) => sum + direction(e) * e.amount, 0);
}

/** The client's wallet transactions: commitment fee payments and refunds. */
export default function WalletLedger({ entries, compact }: { entries: WalletEntry[] | undefined | null; compact?: boolean }) {
  const list = entries ?? [];
  if (list.length === 0) return <p className="rounded-xl bg-mist px-4 py-3 text-sm text-muted">No wallet transactions yet.</p>;
  const currency = list[0]?.currency ?? "NGN";
  return (
    <div>
      {!compact && (
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Balance</p>
          <p className="font-display text-xl font-bold">{formatPrice(walletBalance(list), currency)}</p>
        </div>
      )}
      <p className={cn("text-xs font-bold uppercase tracking-wider text-muted", !compact && "mt-3")}>Transactions</p>
      <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
        {list.map((e, i) => {
          const look = tone(e);
          const dir = direction(e);
          const detail = [e.method, e.receiptNo ?? e.reference, e.note].filter(Boolean).join(" · ");
          return (
            <li key={`${e.type}-${e.reference ?? i}`} className="flex items-center gap-3 px-3.5 py-3">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", look === "good" ? "bg-teal-soft text-teal-700" : look === "bad" ? "bg-danger-soft text-danger" : look === "wait" ? "bg-brand-soft text-brand-700" : "bg-mist text-muted")}>
                {e.type === "refund" ? <ArrowUpRight className="size-4" /> : look === "wait" ? <Clock className="size-4" /> : look === "good" ? <ArrowDownLeft className="size-4" /> : <Receipt className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{e.label}</span>
                {detail && <span className="block truncate text-xs text-muted">{detail}</span>}
              </span>
              <span className="text-right">
                <span className={cn("block text-sm font-bold", dir === 0 && "text-muted")}>
                  {dir === -1 ? "−" : dir === 1 ? "+" : ""}
                  {formatPrice(e.amount, e.currency)}
                </span>
                <span className="block text-xs text-muted">
                  {e.status}
                  {e.at ? ` · ${formatDate(e.at, { day: "numeric", month: "short" })}` : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
