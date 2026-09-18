"use client";

import { useState } from "react";
import { Banknote, CheckCircle2, Eye, Link2, Loader2, Lock, RotateCcw, Wallet, XCircle } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatPrice } from "@/lib/catalog";
import { openRemoteFile } from "@/lib/files";
import { cn, formatDate, relativeDay } from "@/lib/format";
import type { Idea } from "@/lib/ideas";
import { useStaff } from "@/lib/staff";
import {
  FEE_STATES,
  REFUND_STATES,
  completeRefund,
  confirmPayment,
  currentPayment,
  emailResumeLinks,
  feeState,
  recordCentrePayment,
  refundPayment,
  rejectPayment,
} from "@/lib/wallet";
import WalletLedger from "../wallet/WalletLedger";
import type { Notify } from "../PortalApp";
import { apiPath } from "./helpers";

const input = "h-10 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

type Mode = null | "centre" | "reject" | "refund";

/**
 * Commitment fee status and admin actions for one idea.
 * Every button here calls the server, which owns the rules and sends the emails.
 */
export default function PaymentPanel({ idea, notify }: { idea: Idea; notify: Notify }) {
  const me = useStaff();
  const isAdmin = me.role === "admin";
  const state = feeState(idea);
  const payment = currentPayment(idea);
  const refund = payment?.refund;
  const paymentId = payment?.id ?? null;
  const fee = formatPrice(idea.payment.amount, idea.payment.currency);
  const client = idea.name ?? "the client";

  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const reset = () => {
    setMode(null);
    setText("");
    setNote("");
  };

  /** Runs one server action, keeping the panel quiet and the buttons disabled meanwhile. */
  const run = async (working: string, action: () => Promise<unknown>, done: () => void) => {
    if (busy) return;
    setBusy(true);
    setStatus(working);
    try {
      await action();
      done();
      setStatus("");
    } catch (e) {
      const message = errorMessage(e);
      setStatus(message);
      notify(message, "info");
    } finally {
      setBusy(false);
    }
  };

  const atCentre = payment?.method === "manual" && Boolean(payment.recordedBy);
  const methodLabel = atCentre ? "At centre" : payment?.method === "paystack" ? "Paystack" : payment?.method === "manual" ? "Bank transfer" : "—";
  const proof = payment?.manual?.proof;

  return (
    <section aria-label="Commitment fee" className="mt-5 rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display font-semibold">
          <Wallet className="size-5 text-brand" /> Commitment fee
        </p>
        <span className="flex gap-1.5">
          {refund && refund.status !== "NONE" && <Pill className={REFUND_STATES[refund.status].className}>{REFUND_STATES[refund.status].label}</Pill>}
          <Pill className={FEE_STATES[state].className}>{FEE_STATES[state].label}</Pill>
        </span>
      </div>

      <p role="status" aria-live="polite" className={cn("mt-2 flex items-center gap-2 text-xs text-muted", !status && "sr-only")}>
        {busy && <Loader2 className="size-3.5 animate-spin text-brand" />}
        {status}
      </p>

      {/* nothing paid yet */}
      {(state === "UNPAID" || state === "PENDING" || state === "FAILED") && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-muted">
            {state === "PENDING"
              ? `${client} started an online payment that hasn't completed yet.`
              : state === "FAILED"
                ? `The last attempt to pay the ${fee} fee didn't go through.`
                : idea.status === "DRAFT"
                  ? `${client} hasn't finished their application or paid the ${fee} fee yet.`
                  : `No confirmed payment of the ${fee} fee yet.`}{" "}
            The idea can&apos;t be approved until it&apos;s paid.
          </p>
          {payment?.failureReason && <p className="rounded-xl bg-danger-soft/50 px-3 py-2 text-xs text-danger">{payment.failureReason}</p>}
          {isAdmin && mode !== "centre" && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setMode("centre")} disabled={busy} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-navy disabled:opacity-50">
                <Banknote className="size-3.5" /> Record payment at centre
              </button>
              {idea.status === "DRAFT" && (
                <button
                  onClick={() =>
                    void run("Emailing a fresh link…", () => emailResumeLinks(idea.email), () => notify(`Continue link emailed to ${idea.email}.`, "info"))
                  }
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-navy disabled:opacity-50"
                >
                  <Link2 className="size-3.5" /> Email the continue link again
                </button>
              )}
            </div>
          )}
          {mode === "centre" && (
            <div className="space-y-2 rounded-xl bg-mist p-3">
              <p className="text-xs font-bold">Cash or transfer received at the centre</p>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Who paid (optional)" aria-label="Who paid" className={input} disabled={busy} />
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Cash received by front desk, Ikeja centre" aria-label="Payment note" className={input} disabled={busy} />
              <Actions
                busy={busy}
                onCancel={reset}
                confirmLabel={`Record ${fee} as paid`}
                onConfirm={() =>
                  void run(
                    "Recording the payment…",
                    () => recordCentrePayment(idea.id, { senderName: text.trim() || undefined, note: note.trim() || undefined }),
                    () => {
                      notify(`Payment recorded. Receipt emailed to ${client}.`);
                      reset();
                    },
                  )
                }
              />
            </div>
          )}
        </div>
      )}

      {/* the payment that counts */}
      {payment && payment.status !== "PENDING" && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-mist p-3 text-sm">
          <Row label="Amount">{formatPrice(payment.amount, payment.currency)}</Row>
          <Row label="Method">{methodLabel}</Row>
          <Row label="Reference" mono>
            {payment.reference ?? "—"}
          </Row>
          {payment.receiptNo && (
            <Row label="Receipt" mono>
              {payment.receiptNo}
            </Row>
          )}
          {payment.manual?.senderName && <Row label="Sender">{`${payment.manual.senderName}${payment.manual.senderBank ? ` · ${payment.manual.senderBank}` : ""}`}</Row>}
          {payment.manual?.amountClaimed != null && <Row label="Client says they sent">{formatPrice(payment.manual.amountClaimed, payment.currency)}</Row>}
          {payment.manual?.transferDate && <Row label="Date sent">{formatDate(payment.manual.transferDate)}</Row>}
          {payment.paidAt && <Row label="Paid">{formatDate(payment.paidAt)}</Row>}
          {payment.channel && <Row label="Paid with">{payment.channel}</Row>}
          {payment.confirmedBy && <Row label="Confirmed by">{payment.confirmedBy}</Row>}
          {payment.recordedBy && <Row label="Recorded by">{payment.recordedBy}</Row>}
          {payment.manual?.note && <Row label="Note">{payment.manual.note}</Row>}
          {payment.refundAccount && (
            <Row label="Refund account">{`${payment.refundAccount.accountName} · ${payment.refundAccount.bankName} ${payment.refundAccount.accountNumber}`}</Row>
          )}
        </dl>
      )}
      {proof?.url && (
        <button
          onClick={() => {
            const path = apiPath(proof.url);
            if (path) void openRemoteFile(path, proof.name, "view").then((ok) => ok || notify("We couldn't open that file.", "info"));
          }}
          className="mt-2 flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-navy"
        >
          <Eye className="size-3.5" /> Proof of payment · {proof.name}
        </button>
      )}

      {/* confirm a reported transfer */}
      {state === "AWAITING_CONFIRMATION" &&
        (isAdmin && paymentId ? (
          mode === "reject" ? (
            <div className="mt-3 space-y-2 rounded-xl bg-danger-soft/50 p-3">
              <p className="text-xs font-bold">Why couldn&apos;t you find it? The client sees this.</p>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. No transfer from Halima Bello on 16 Sept"
                aria-label="Reason the payment wasn't found"
                className={input}
                disabled={busy}
              />
              <Actions
                busy={busy}
                onCancel={reset}
                danger
                disabled={text.trim().length < 5}
                confirmLabel="Mark as not received"
                onConfirm={() =>
                  void run(
                    "Telling the client…",
                    () => rejectPayment(paymentId, text.trim()),
                    () => {
                      notify(`${client} was asked to check their transfer.`, "info");
                      reset();
                    },
                  )
                }
              />
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => setMode("reject")}
                disabled={busy}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-bold text-muted hover:border-danger hover:text-danger disabled:opacity-50"
              >
                <XCircle className="size-4" /> Not received
              </button>
              <button
                onClick={() =>
                  void run("Confirming the transfer…", () => confirmPayment(paymentId), () => notify(`Payment confirmed. Receipt emailed to ${client}.`))
                }
                disabled={busy}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Confirm received
              </button>
            </div>
          )
        ) : (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Lock className="size-3.5" /> An admin needs to confirm this transfer.
          </p>
        ))}

      {/* refunds */}
      {payment && refund && refund.status !== "NONE" && (
        <div className={cn("mt-3 space-y-2 rounded-xl p-3 text-sm", refund.status === "REFUNDED" ? "bg-mist" : "bg-danger-soft/40")}>
          <p className="flex items-center gap-2 font-bold">
            <RotateCcw className="size-4" /> Refund {formatPrice(payment.amount, payment.currency)}
          </p>
          <p className="text-xs text-muted">
            {refund.queuedAt ? `Queued ${relativeDay(refund.queuedAt).toLowerCase()}` : "Queued"}
            {refund.reference ? ` · ${refund.reference}` : ""}
            {payment.refundedBy ? ` · by ${payment.refundedBy}` : ""}
            {refund.at ? ` · refunded ${formatDate(refund.at)}` : ""}
            {refund.note ? ` · ${refund.note}` : ""}
          </p>

          {isAdmin && paymentId && refund.status === "PENDING" && payment.method === "paystack" && (
            <button
              onClick={() =>
                void run("Sending the refund to Paystack…", () => refundPayment(paymentId), () =>
                  notify("Refund sent to Paystack. It completes when Paystack confirms it.", "info"),
                )
              }
              disabled={busy}
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-navy text-sm font-bold text-white hover:bg-navy-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Refund through Paystack
            </button>
          )}

          {isAdmin && paymentId && refund.status === "PENDING" && payment.method === "manual" && (
            <>
              <p className="text-xs">
                Send it to{" "}
                <b>
                  {payment.refundAccount
                    ? `${payment.refundAccount.accountName} · ${payment.refundAccount.bankName} ${payment.refundAccount.accountNumber}`
                    : "the client (ask them for their bank details)"}
                </b>
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Transfer reference" aria-label="Refund transfer reference" className={input} disabled={busy} />
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Refund note" className={input} disabled={busy} />
              </div>
              <button
                disabled={busy || text.trim().length < 3}
                onClick={() =>
                  void run(
                    "Recording the refund…",
                    () => refundPayment(paymentId, { reference: text.trim(), note: note.trim() || undefined }),
                    () => {
                      notify(`Refund recorded. ${client} was notified.`);
                      reset();
                    },
                  )
                }
                className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-navy text-sm font-bold text-white hover:bg-navy-700 disabled:opacity-40"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Mark refunded
              </button>
            </>
          )}

          {isAdmin && paymentId && refund.status === "PROCESSING" && (
            <>
              <p className="text-xs text-muted">Paystack normally confirms this itself. Only mark it done if you can see the refund on your Paystack dashboard.</p>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Reference (optional)" aria-label="Refund reference" className={input} disabled={busy} />
              <button
                onClick={() =>
                  void run(
                    "Closing the refund…",
                    () => completeRefund(paymentId, { reference: text.trim() || undefined }),
                    () => {
                      notify(`Refund completed. ${client} was notified.`);
                      reset();
                    },
                  )
                }
                disabled={busy}
                className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-white text-sm font-bold hover:border-navy disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4 text-teal" />} Mark as refunded
              </button>
            </>
          )}
        </div>
      )}

      {/* the client's own wallet: the fee, every payment and any refund */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-bold text-muted hover:text-navy">Client wallet ({idea.wallet.length} line{idea.wallet.length === 1 ? "" : "s"})</summary>
        <div className="mt-2">
          <WalletLedger entries={idea.wallet} compact />
        </div>
      </details>
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

function Actions({ onCancel, onConfirm, confirmLabel, disabled, danger, busy }: { onCancel: () => void; onConfirm: () => void; confirmLabel: string; disabled?: boolean; danger?: boolean; busy?: boolean }) {
  return (
    <div className="flex gap-2">
      <button onClick={onCancel} disabled={busy} className="h-10 flex-1 rounded-xl border border-line bg-white text-sm font-bold text-muted disabled:opacity-50">
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={disabled || busy}
        className={cn("flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold text-white disabled:opacity-40", danger ? "bg-danger" : "bg-teal hover:bg-teal-700")}
      >
        {busy && <Loader2 className="size-4 animate-spin" />} {confirmLabel}
      </button>
    </div>
  );
}
