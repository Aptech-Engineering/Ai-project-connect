"use client";

/**
 * Commitment fee wallet, backed by the PHP API in backend/.
 *
 * Two audiences share this file:
 *
 * 1. The applicant (no sign-in). Everything hangs off a private **resume token**:
 *    create a draft, save it as they type, pay the fee, submit. The token is the only
 *    thing we keep in this browser (`rememberDraft` / `forgetDraft`); the application
 *    itself always comes from the server. Because reading it now needs a request,
 *    `rememberedDraft()` is gone: use `useRememberedDraft()` in a component, or
 *    `loadRememberedDraft()` outside one.
 *
 * 2. Admins, who confirm transfers, record payments taken at a centre, send refunds
 *    and start walk-in applications.
 *
 * Paying online is a real Paystack checkout: `startPaystack` returns an
 * `authorizationUrl` and the caller sends the browser there with `goToPaystack`.
 * Paystack sends the payer back to /apply with `?payment=…&reference=…`, which
 * `paystackResult()` reads. Nothing in the browser can mark a payment as paid — the
 * server verifies it with Paystack and its webhook.
 *
 * Every response that contains an application is the newest state, so mutations put it
 * straight into the query cache; staff actions call `refreshIdeas()` instead.
 */
import { useEffect, useState } from "react";
import { ApiError, api, formData, query } from "./api";
import { formatPrice } from "./catalog";
import { invalidate, primeQuery, useApi } from "./remote";
import { readPaymentSettings } from "./settings";
import { KEYS, refreshIdeas } from "./store";
import type {
  FeeState,
  Idea,
  IdeaPayment,
  IdeaSource,
  IdeaStatus,
  PaymentMethod,
  PaymentStatus,
  RefundAccount,
  RefundStatus,
  WalletEntry,
} from "./ideas";

export type { FeeState, RefundAccount, WalletEntry } from "./ideas";

const APPLICATIONS = "/applications";
const DRAFT = "/applications/draft";
const DRAFT_KEY = "apc-idea-draft-token";

const draftPath = (token: string) => DRAFT + query({ token });

/* ================= fee settings ================= */

/**
 * The fee, the bank account and the wording shown to clients.
 * This needs an admin session, so the public application page should read
 * `application.checkout` instead — same numbers, no sign-in.
 */
export function feeSettings() {
  return readPaymentSettings();
}

export function feeLabel() {
  const { commitmentFee, currency } = feeSettings();
  return formatPrice(commitmentFee, currency);
}

/** The same label from the public checkout block. */
export function checkoutFeeLabel(checkout: Pick<Checkout, "fee" | "currency">) {
  return formatPrice(checkout.fee, checkout.currency);
}

/* ================= payment state ================= */

export const FEE_STATES: Record<FeeState, { label: string; className: string }> = {
  UNPAID: { label: "Fee unpaid", className: "bg-line text-muted" },
  PENDING: { label: "Paying…", className: "bg-blue-soft text-navy" },
  AWAITING_CONFIRMATION: { label: "Confirm payment", className: "bg-brand-soft text-brand-700" },
  PAID: { label: "Fee paid", className: "bg-teal-soft text-teal-700" },
  FAILED: { label: "Payment failed", className: "bg-danger-soft text-danger" },
};

/** Refund badges. A payment with nothing to refund is `NONE`, which has no badge. */
export const REFUND_STATES: Record<Exclude<RefundStatus, "NONE">, { label: string; className: string }> = {
  PENDING: { label: "Refund due", className: "bg-danger-soft text-danger" },
  PROCESSING: { label: "Refund processing", className: "bg-blue-soft text-navy" },
  REFUNDED: { label: "Refunded", className: "bg-mist text-muted" },
};

/**
 * An idea from the inbox, or an application seen by the person who wrote it.
 * Ideas carry `paymentStatus`, which is the fee state of the idea as a whole; an
 * application only has the payment itself.
 */
type FeePayer = { payment: IdeaPayment; paymentStatus?: FeeState };

export function feeState(source: FeePayer): FeeState {
  return source.paymentStatus ?? source.payment.status;
}

/**
 * The attempt that counts, or undefined when nobody has tried to pay yet.
 * Only the current attempt is sent; earlier ones are in the wallet ledger.
 */
export function currentPayment(source: FeePayer): IdeaPayment | undefined {
  return source.payment.status === "UNPAID" ? undefined : source.payment;
}

export function paidPayment(source: FeePayer): IdeaPayment | undefined {
  return source.payment.status === "PAID" ? source.payment : undefined;
}

/** The current attempt when it failed, so the page can offer to try again. */
export function lastFailedPayment(source: FeePayer): IdeaPayment | undefined {
  return source.payment.status === "FAILED" ? source.payment : undefined;
}

/** Why an admin can't approve this idea yet, or null when the fee is confirmed. */
export function paymentBlocker(source: FeePayer): string | null {
  const state = feeState(source);
  if (state === "PAID") return null;
  if (state === "AWAITING_CONFIRMATION") return `Confirm the client's ${feeLabel()} transfer before approving this idea.`;
  if (state === "PENDING") return "The client's online payment hasn't completed yet, so this idea can't be approved.";
  return `The client hasn't paid the ${feeLabel()} commitment fee yet, so this idea can't be approved.`;
}

/* ================= the wallet ledger ================= */

/**
 * A wallet line ready to display. The server sends the lines (`wallet`); we only add
 * what the list needs: a key, a one-line detail and whether money moved in or out.
 */
export interface LedgerEntry extends WalletEntry {
  id: string;
  detail: string;
  /** +1 money in, -1 money back out, 0 informational. */
  direction: 1 | -1 | 0;
  tone: "good" | "wait" | "bad" | "muted";
}

const PAYMENT_TONES: Record<string, LedgerEntry["tone"]> = {
  PAID: "good",
  REFUNDED: "good",
  FAILED: "bad",
  UNPAID: "muted",
  NONE: "muted",
  PENDING: "wait",
  PROCESSING: "wait",
  AWAITING_CONFIRMATION: "wait",
};

function detailOf(e: WalletEntry) {
  if (e.type === "fee") return `Reference ${e.reference ?? "—"}`;
  const parts = [e.receiptNo ?? e.reference, e.note].filter(Boolean);
  return parts.length ? parts.join(" · ") : "";
}

/** The client's transactions, in the order the server sends them (the fee first). */
export function walletLedger(source: { wallet?: WalletEntry[] | null }): LedgerEntry[] {
  return (source.wallet ?? []).map((e, i) => ({
    ...e,
    id: `${e.type}-${e.reference ?? i}`,
    detail: detailOf(e),
    direction: e.type === "payment" && e.status === "PAID" ? 1 : e.type === "refund" && e.status === "REFUNDED" ? -1 : 0,
    tone: PAYMENT_TONES[e.status] ?? "muted",
  }));
}

/** What the wallet holds: fees paid, less anything refunded. */
export function walletBalance(source: { wallet?: WalletEntry[] | null }) {
  return walletLedger(source).reduce((sum, e) => sum + e.direction * e.amount, 0);
}

/* ================= the application (public, resume token) ================= */

/** The form itself. Everything but the email may still be empty while it's a draft. */
export interface ApplicationFields {
  name: string | null;
  email: string;
  phone: string | null;
  organisation: string | null;
  country: string | null;
  state: string | null;
  title: string | null;
  category: string | null;
  platforms: string[];
  problem: string | null;
  targetUsers: string | null;
  features: string | null;
  budget: string | null;
  timeline: string | null;
  nda: boolean;
}

/** What we send when saving: only the fields that changed. null clears one. */
export type DraftFields = Partial<ApplicationFields>;

/** Amounts, methods and bank details for the payment step, with no admin session. */
export interface Checkout {
  fee: number;
  feeKobo: number;
  currency: string;
  feeTitle: string;
  feeExplainer: string;
  confirmationTime: string;
  paystack: { enabled: boolean; publicKey: string | null; mode: "test" | "live" };
  manual: { enabled: boolean; bankName: string; accountName: string; accountNumber: string; transferInstructions: string };
}

/** An application as the person who wrote it sees it. */
export interface Application {
  ref: string;
  status: IdeaStatus;
  source: IdeaSource;
  fields: ApplicationFields;
  attachment: { name: string; size: number } | null;
  /** API field names still to fill in, e.g. ["problem", "budget"]. */
  missingFields: string[];
  complete: boolean;
  /** Complete and the fee is paid (or a transfer is being checked). */
  canSubmit: boolean;
  createdAt: string | null;
  lastSavedAt: string | null;
  submittedAt: string | null;
  payment: IdeaPayment;
  wallet: WalletEntry[];
  checkout: Checkout;
}

/** The link the server emails. Opening it resumes the application. */
export function resumeLink(token: string) {
  return `/apply?resume=${encodeURIComponent(token)}`;
}

export function rememberDraft(token: string) {
  try {
    localStorage.setItem(DRAFT_KEY, token);
  } catch {
    /* private mode */
  }
}

export function forgetDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* private mode */
  }
}

/** The resume token saved in this browser, if any. */
export function rememberedDraftToken(): string | null {
  try {
    return localStorage.getItem(DRAFT_KEY);
  } catch {
    return null; // private mode
  }
}

/** Puts a fresh application into the cache so every screen using this token sees it. */
function keep(token: string, application: Application) {
  primeQuery(draftPath(token), application);
  return application;
}

/** One application by its resume token. A null token means "nothing saved here". */
export function useApplication(token: string | null) {
  const { data, loading, error, refresh } = useApi<Application>(token ? draftPath(token) : null);
  return { application: data, loading, error, refresh };
}

export function loadApplication(token: string) {
  return api.get<Application>(draftPath(token));
}

/**
 * The unfinished application saved in this browser. `application` is only set while
 * it is still a draft; once it's submitted the token is dropped.
 */
export function useRememberedDraft() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => setToken(rememberedDraftToken()), []);
  const { application, loading, error, refresh } = useApplication(token);
  const draft = application?.status === "DRAFT" ? application : undefined;
  useEffect(() => {
    if (application && application.status !== "DRAFT") forgetDraft();
  }, [application]);
  // A token that no longer opens anything (deleted, or a different server) is dead weight.
  useEffect(() => {
    if (token && !loading && !application && error) {
      forgetDraft();
      setToken(null);
    }
  }, [token, loading, application, error]);
  return { token, application: draft, loading, error, refresh };
}

/** The same thing outside a component. Returns null when there's nothing usable. */
export async function loadRememberedDraft() {
  const token = rememberedDraftToken();
  if (!token) return null;
  let application: Application;
  try {
    application = await loadApplication(token);
  } catch (e) {
    // A link that no longer works is an answer, not a failure.
    if (e instanceof ApiError && e.status === 404) {
      forgetDraft();
      return null;
    }
    throw e;
  }
  if (application.status !== "DRAFT") {
    forgetDraft();
    return null;
  }
  return { token, application };
}

/**
 * Starts a saved application as soon as we know the email, and emails the person a
 * link to continue. The token is remembered here, so the caller doesn't have to.
 * `devLink` only comes back outside production.
 */
export async function createDraft(fields: DraftFields, attachment?: File) {
  const result = await api.post<{ token: string; application: Application; devLink?: string }>(
    APPLICATIONS,
    attachment ? formData({ ...fields, attachment }) : fields,
  );
  rememberDraft(result.token);
  keep(result.token, result.application);
  return result;
}

/** Saves what they've typed so far. Returns the application as the server now holds it. */
export async function saveDraft(token: string, fields: DraftFields, file?: { attachment?: File; removeAttachment?: boolean }) {
  const body =
    file?.attachment || file?.removeAttachment
      ? formData({ ...fields, token, attachment: file.attachment, removeAttachment: file.removeAttachment ? "1" : undefined })
      : { ...fields, token };
  return keep(token, await api.post<Application>(DRAFT, body));
}

/**
 * "I've lost my link": emails one for every open draft under this email.
 * The message is the same whether or not we know the address, so callers can show it as is.
 */
export function emailResumeLinks(email: string) {
  return api.post<{ message: string; devLinks?: string[] }>(`${APPLICATIONS}/resume-links`, { email: email.trim() });
}

/**
 * Emails one draft a brand-new link (admin only). Prefer this over
 * `emailResumeLinks`, which emails a link for every open draft under that address.
 */
export async function resendResumeLink(ideaId: number) {
  const result = await api.post<{ sentTo: string; idea: unknown; devLink?: string }>(`/staff/ideas/${ideaId}/resume-link`, {});
  await refreshIdeas();
  return result;
}

/** Which sections of the form are still missing, from the server's field list. */
const FIELD_SECTIONS: Record<string, string> = {
  name: "About you",
  email: "About you",
  phone: "About you",
  country: "About you",
  state: "About you",
  title: "Your idea",
  category: "Your idea",
  platforms: "Your idea",
  problem: "Your idea",
  targetUsers: "Your idea",
  features: "Your idea",
  budget: "Budget & timeline",
  timeline: "Budget & timeline",
};

export function draftMissing(application: Pick<Application, "missingFields">) {
  const sections: string[] = [];
  for (const field of application.missingFields) {
    const section = FIELD_SECTIONS[field];
    if (section && !sections.includes(section)) sections.push(section);
  }
  return sections;
}

/* ================= paying ================= */

export interface PaystackCheckout {
  reference: string;
  /** Send the browser here; Paystack's own page takes the payment. */
  authorizationUrl: string;
  accessCode: string;
  publicKey: string | null;
  email: string;
  amount: number;
  amountKobo: number;
  currency: string;
}

/** Opens a Paystack checkout for the fee. The payment is only PENDING until Paystack confirms it. */
export async function startPaystack(token: string) {
  const checkout = await api.post<PaystackCheckout>(`${APPLICATIONS}/pay/paystack`, { token });
  await invalidate(draftPath(token));
  return checkout;
}

/** Leaves the site for Paystack's page. There is no in-app checkout. */
export function goToPaystack(checkout: Pick<PaystackCheckout, "authorizationUrl">) {
  window.location.assign(checkout.authorizationUrl);
}

export type PaymentOutcome = "success" | "pending" | "failed";

/**
 * What Paystack's callback put in the URL when it sent the payer back to /apply.
 * Null when they didn't come from a payment. The server has already verified it.
 */
export function paystackResult(search?: string): { outcome: PaymentOutcome; reference: string | null; ref: string | null } | null {
  if (search === undefined && typeof window === "undefined") return null;
  const params = new URLSearchParams(search ?? window.location.search);
  const outcome = params.get("payment");
  if (outcome !== "success" && outcome !== "pending" && outcome !== "failed") return null;
  return { outcome, reference: params.get("reference"), ref: params.get("ref") };
}

/** Takes the payment answer out of the address bar so a refresh doesn't repeat it. */
export function clearPaystackResult() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  ["payment", "reference", "ref"].forEach((k) => url.searchParams.delete(k));
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

export interface ManualClaim {
  senderName: string;
  senderBank: string;
  /** What they actually sent; the server refuses less than the fee. */
  amount: number;
  /** YYYY-MM-DD */
  transferDate: string;
  /** Where to refund if we can't take the idea on. */
  refundAccountName?: string;
  refundAccountNumber?: string;
  refundBank?: string;
  proof?: File;
}

/** "I have sent the money": the fee waits for an admin to confirm the transfer. */
export async function claimManualPayment(token: string, claim: ManualClaim) {
  return keep(token, await api.post<Application>(`${APPLICATIONS}/pay/manual`, formData({ ...claim, token })));
}

/** Changes where a bank transfer would be refunded to, until the refund is sent. */
export async function updateRefundAccount(token: string, account: RefundAccount) {
  return keep(token, await api.post<Application>(`${APPLICATIONS}/refund-account`, { ...account, token }));
}

/**
 * Sends the application to the team. The server checks it's complete and the fee is
 * paid (or a transfer is being checked), so the saved token is no longer needed.
 */
export async function submitDraft(token: string) {
  const result = await api.post<{ ref: string; title: string | null; status: IdeaStatus; submittedAt: string | null; application: Application }>(
    `${APPLICATIONS}/submit`,
    { token },
  );
  keep(token, result.application);
  forgetDraft();
  return result;
}

/* ================= staff: payments & refunds ================= */

/** A payment in the admin queue, with the idea it belongs to. */
export interface StaffPayment extends IdeaPayment {
  id: number;
  idea: {
    id: number;
    ref: string;
    title: string | null;
    name: string | null;
    email: string;
    phone: string | null;
    status: IdeaStatus;
    source: IdeaSource;
  };
}

export interface PaymentCounts {
  awaitingConfirmation: number;
  refundsPending: number;
  refundsProcessing: number;
  paid: number;
  /** Fees paid, less anything already refunded. */
  collected: number;
}

export type PaymentFilters = {
  status?: PaymentStatus;
  method?: PaymentMethod;
  /** "open" means queued or processing. */
  refund?: "open" | RefundStatus;
  q?: string;
};

/** The payments queue (admin only). Pass `enabled: false` for staff who can't see it. */
export function useStaffPayments(filters: PaymentFilters = {}, enabled = true) {
  const { data, loading, error, refresh } = useApi<{ items: StaffPayment[]; counts: PaymentCounts }>(enabled ? KEYS.payments + query(filters) : null);
  return { payments: data?.items ?? [], counts: data?.counts, loading, error, refresh };
}

const paymentPath = (id: number) => `${KEYS.payments}/${id}`;

/** The money arrived: marks the transfer paid and emails the receipt. */
export async function confirmPayment(paymentId: number, note?: string) {
  const payment = await api.post<StaffPayment>(`${paymentPath(paymentId)}/confirm`, { note });
  await refreshIdeas();
  return payment;
}

/** We couldn't find the transfer. The client is emailed a link to try again. */
export async function rejectPayment(paymentId: number, reason: string) {
  const payment = await api.post<StaffPayment>(`${paymentPath(paymentId)}/reject`, { reason });
  await refreshIdeas();
  return payment;
}

/**
 * Sends a queued refund. Paystack refunds go through Paystack (PROCESSING until its
 * webhook says otherwise); a bank transfer needs the reference of the transfer you sent.
 */
export async function refundPayment(paymentId: number, input: { reference?: string; note?: string } = {}) {
  const payment = await api.post<StaffPayment>(`${paymentPath(paymentId)}/refund`, input);
  await refreshIdeas();
  return payment;
}

/** Marks a refund as done, e.g. when Paystack's webhook never arrived. */
export async function completeRefund(paymentId: number, input: { reference?: string; note?: string } = {}) {
  const payment = await api.post<StaffPayment>(`${paymentPath(paymentId)}/refund/complete`, input);
  await refreshIdeas();
  return payment;
}

export interface CentrePayment {
  /** Defaults to the fee. */
  amount?: number;
  senderName?: string;
  note?: string;
  refundAccountName?: string;
  refundAccountNumber?: string;
  refundBank?: string;
}

/** Cash or a transfer taken at an Aptech centre: recorded and confirmed in one step. */
export async function recordCentrePayment(ideaId: number, input: CentrePayment = {}) {
  const payment = await api.post<StaffPayment>(`${KEYS.ideas}/${ideaId}/payments/centre`, input);
  await refreshIdeas();
  return payment;
}

export interface WalkInFields {
  name: string;
  email: string;
  phone?: string;
  organisation?: string;
  country?: string;
  state?: string;
  title?: string;
  category?: string;
  platforms?: string[];
  problem?: string;
  targetUsers?: string;
  features?: string;
  budget?: string;
  timeline?: string;
  nda?: boolean;
  /** The brief they brought with them. */
  attachment?: File;
}

/**
 * Walk-in clients follow the same flow as everyone else: an admin starts the
 * application, then the client finishes and pays from the link we email and text them.
 * `sentTo` is their masked email; `devLink` only comes back outside production.
 */
export async function startWalkInApplication(fields: WalkInFields) {
  const { attachment, ...rest } = fields;
  const result = await api.post<{ idea: Idea; sentTo: string; devLink?: string }>(
    "/staff/walk-ins",
    attachment ? formData({ ...rest, attachment }) : rest,
  );
  await refreshIdeas();
  return result;
}

/* ================= reports ================= */

/**
 * Fee totals for the dashboard. `counts` comes straight from the payments endpoint;
 * `refunded` is added up from the payments passed in, because the API doesn't total it —
 * so it only covers the payments on screen.
 */
export function feeSummary(counts?: PaymentCounts, payments: StaffPayment[] = []) {
  const net = counts?.collected ?? 0;
  const refunded = payments.filter((p) => p.refund.status === "REFUNDED").reduce((sum, p) => sum + p.amount, 0);
  return {
    collected: net + refunded,
    refunded,
    net,
    awaiting: counts?.awaitingConfirmation ?? 0,
    refundsDue: counts?.refundsPending ?? 0,
    refundsProcessing: counts?.refundsProcessing ?? 0,
    paid: counts?.paid ?? 0,
  };
}
