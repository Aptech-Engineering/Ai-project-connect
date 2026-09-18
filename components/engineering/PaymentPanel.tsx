"use client";

import { useState } from "react";
import { Banknote, CheckCircle2, Eye, Link2, Lock, RotateCcw, Wallet, XCircle } from "lucide-react";
import { formatPrice } from "@/lib/catalog";
import { openStoredFile } from "@/lib/files";
import { cn, formatDate, relativeDay } from "@/lib/format";
import type { Idea } from "@/lib/ideas";
import { useStaff } from "@/lib/staff";
import {
  FEE_STATES,
  REFUND_STATES,
  confirmPayment,
  currentPayment,
  emailResumeLinks,
  feeLabel,
  feeState,
  markRefundProcessed,
  paidPayment,
  recordCentrePayment,
  rejectPayment,
  startRefund,
} from "@/lib/wallet";
import type { Notify } from "../PortalApp";
import { actingAs } from "./helpers";

const input = "h-10 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

/** Commitment fee status and admin actions for one idea. */
export default function PaymentPanel({ idea, notify }: { idea: Idea; notify: Notify }) {
  const me = useStaff();
  const isAdmin = me.role === "admin";
  const state = feeState(idea);
  const payment = currentPayment(idea);
  const paid = paidPayment(idea);
  const refund = paid?.refund;
  const failed = (idea.payments ?? []).filter((p) => p.status === "FAILED");
  const [mode, setMode] = useState<null | "centre" | "reject" | "refund">(null);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");

  const reset = () => {
    setMode(null);
    setText("");
    setNote("");
  };

  return (
    <section aria-label="Commitment fee" className="mt-5 rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display font-semibold">
          <Wallet className="size-5 text-brand" /> Commitment fee
        </p>
        <span className="flex gap-1.5">
          {refund && <Pill className={REFUND_STATES[refund.status].className}>{REFUND_STATES[refund.status].label}</Pill>}
          <Pill className={FEE_STATES[state].className}>{FEE_STATES[state].label}</Pill>
        </span>
      </div>

      {/* nothing paid */}
      {(state === "UNPAID" || state === "PENDING") && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-muted">
            {idea.status === "DRAFT" ? "The client hasn't finished their application or paid the " : "No confirmed payment of the "}
            {feeLabel()} fee yet. The idea can&apos;t be approved until it&apos;s paid.
          </p>
          {isAdmin && mode !== "centre" && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setMode("centre")} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-navy">
                <Banknote className="size-3.5" /> Record payment at centre
              </button>
              {idea.status === "DRAFT" && (
                <button
                  onClick={() => {
                    emailResumeLinks(idea.email);
                    notify(`Continue link emailed to ${idea.email}.`, "info");
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-navy"
                >
                  <Link2 className="size-3.5" /> Resend continue link
                </button>
              )}
            </div>
          )}
          {mode === "centre" && (
            <div className="space-y-2 rounded-xl bg-mist p-3">
              <p className="text-xs font-bold">Cash or transfer received at the centre</p>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Cash received by front desk, Ikeja centre" aria-label="Payment note" className={input} />
              <Actions
                onCancel={reset}
                confirmLabel={`Record ${feeLabel()} as paid`}
                onConfirm={() => {
                  recordCentrePayment(idea.id, note.trim() || "Paid at centre", actingAs(me));
                  notify(`Payment recorded. Receipt emailed to ${idea.name}.`);
                  reset();
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* details of the current payment */}
      {payment && payment.status !== "PENDING" && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-mist p-3 text-sm">
          <Row label="Amount">{formatPrice(payment.amount, payment.currency)}</Row>
          <Row label="Method">{payment.atCentre ? "At centre" : payment.method === "paystack" ? "Paystack" : "Bank transfer"}</Row>
          <Row label="Reference" mono>
            {payment.reference}
          </Row>
          {payment.receiptNo && (
            <Row label="Receipt" mono>
              {payment.receiptNo}
            </Row>
          )}
          {payment.senderName && <Row label="Sender">{`${payment.senderName}${payment.senderBank ? ` · ${payment.senderBank}` : ""}`}</Row>}
          {payment.transferDate && <Row label="Date sent">{formatDate(payment.transferDate)}</Row>}
          {payment.paidAt && <Row label="Paid">{formatDate(payment.paidAt)}</Row>}
          {payment.confirmedBy && <Row label="Confirmed by">{payment.confirmedBy}</Row>}
          {payment.note && <Row label="Note">{payment.note}</Row>}
          {idea.refundAccount && payment.method === "manual" && !payment.atCentre && <Row label="Refund account">{`${idea.refundAccount.name} · ${idea.refundAccount.bank} ${idea.refundAccount.number}`}</Row>}
        </dl>
      )}
      {payment?.proof && (
        <button onClick={() => openStoredFile(payment.proof!.id, payment.proof!.name, "view")} className="mt-2 flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-navy">
          <Eye className="size-3.5" /> Proof of payment · {payment.proof.name}
        </button>
      )}

      {/* confirm a reported transfer */}
      {state === "AWAITING_CONFIRMATION" &&
        (isAdmin ? (
          mode === "reject" ? (
            <div className="mt-3 space-y-2 rounded-xl bg-danger-soft/50 p-3">
              <p className="text-xs font-bold">Why couldn&apos;t you find it? The client sees this.</p>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. No transfer from Halima Bello on 16 Sept" aria-label="Reason payment wasn't found" className={input} />
              <Actions
                onCancel={reset}
                danger
                disabled={text.trim().length < 5}
                confirmLabel="Mark as not received"
                onConfirm={() => {
                  rejectPayment(idea.id, text.trim(), actingAs(me));
                  notify(`${idea.name} was asked to check their transfer.`, "info");
                  reset();
                }}
              />
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button onClick={() => setMode("reject")} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-bold text-muted hover:border-danger hover:text-danger">
                <XCircle className="size-4" /> Not received
              </button>
              <button
                onClick={() => {
                  confirmPayment(idea.id, actingAs(me));
                  notify(`Payment confirmed. Receipt emailed to ${idea.name}.`);
                }}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal text-sm font-bold text-white hover:bg-teal-700"
              >
                <CheckCircle2 className="size-4" /> Confirm received
              </button>
            </div>
          )
        ) : (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Lock className="size-3.5" /> An admin needs to confirm this transfer.
          </p>
        ))}

      {/* refunds */}
      {refund && paid && (
        <div className={cn("mt-3 space-y-2 rounded-xl p-3 text-sm", refund.status === "REFUNDED" ? "bg-mist" : "bg-danger-soft/40")}>
          <p className="flex items-center gap-2 font-bold">
            <RotateCcw className="size-4" /> Refund {formatPrice(paid.amount, paid.currency)}
          </p>
          <p className="text-xs text-muted">
            {refund.reason} · queued {relativeDay(refund.queuedAt).toLowerCase()}
            {refund.reference ? ` · ${refund.reference}` : ""}
            {refund.by ? ` · by ${refund.by}` : ""}
            {refund.completedAt ? ` · refunded ${formatDate(refund.completedAt)}` : ""}
            {refund.note ? ` · ${refund.note}` : ""}
          </p>
          {isAdmin && refund.status === "PENDING" && paid.method === "paystack" && (
            <button
              onClick={() => {
                startRefund(idea.id, actingAs(me));
                notify("Refund sent to Paystack. It completes when Paystack confirms.", "info");
              }}
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-navy text-sm font-bold text-white hover:bg-navy-700"
            >
              <RotateCcw className="size-4" /> Refund through Paystack
            </button>
          )}
          {isAdmin && refund.status === "PROCESSING" && (
            <button
              onClick={() => {
                markRefundProcessed(idea.id, actingAs(me));
                notify(`Refund completed. ${idea.name} was notified.`);
              }}
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-white text-sm font-bold hover:border-navy"
            >
              <CheckCircle2 className="size-4 text-teal" /> Paystack confirmed · mark refunded
            </button>
          )}
          {isAdmin && refund.status === "PENDING" && paid.method === "manual" && (
            <>
              <p className="text-xs">
                Send it to{" "}
                <b>{idea.refundAccount ? `${idea.refundAccount.name} · ${idea.refundAccount.bank} ${idea.refundAccount.number}` : "the client (ask for their bank details)"}</b>
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Transfer reference" aria-label="Refund transfer reference" className={input} />
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Refund note" className={input} />
              </div>
              <button
                disabled={text.trim().length < 3}
                onClick={() => {
                  startRefund(idea.id, actingAs(me), { reference: text.trim(), note: note.trim() || undefined });
                  notify(`Refund recorded. ${idea.name} was notified.`);
                  reset();
                }}
                className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-navy text-sm font-bold text-white hover:bg-navy-700 disabled:opacity-40"
              >
                <CheckCircle2 className="size-4" /> Mark refunded
              </button>
            </>
          )}
        </div>
      )}

      {failed.length > 0 && (
        <details className="mt-3 text-xs text-muted">
          <summary className="cursor-pointer font-bold">Earlier attempts ({failed.length})</summary>
          <ul className="mt-1 space-y-1">
            {failed.map((p) => (
              <li key={p.id}>
                {formatDate(p.createdAt)} · {p.method === "paystack" ? "Paystack" : "Transfer"} · {p.reference} · {p.failureReason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", className)}>{children}</span>;
}

function Row({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn("truncate font-bold", mono && "font-mono text-xs")}>{children}</dd>
    </div>
  );
}

function Actions({ onCancel, onConfirm, confirmLabel, disabled, danger }: { onCancel: () => void; onConfirm: () => void; confirmLabel: string; disabled?: boolean; danger?: boolean }) {
  return (
    <div className="flex gap-2">
      <button onClick={onCancel} className="h-10 flex-1 rounded-xl border border-line bg-white text-sm font-bold text-muted">
        Cancel
      </button>
      <button onClick={onConfirm} disabled={disabled} className={cn("h-10 flex-1 rounded-xl text-sm font-bold text-white disabled:opacity-40", danger ? "bg-danger" : "bg-teal hover:bg-teal-700")}>
        {confirmLabel}
      </button>
    </div>
  );
}
