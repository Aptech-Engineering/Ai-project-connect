"use client";

/**
 * Commitment fee wallet: saved drafts, the ₦2,000 fee (Paystack or manual transfer),
 * admin confirmation, approval gating and refunds. Mirrors the PHP API in backend/.
 */
import { readSiteContent } from "./content";
import { readPaymentSettings } from "./settings";
import { formatPrice } from "./catalog";
import type { StoredFileMeta } from "./files";
import {
  addIdea,
  findIdeaById,
  randomCode,
  randomRef,
  randomToken,
  readIdeas,
  updateIdea,
  type Idea,
  type IdeaInput,
  type IdeaPayment,
  type PaymentStatus,
  type RefundAccount,
  type RefundStatus,
} from "./ideas";
import { logActivity, notifyStaff, sendNotice, uid } from "./store";
import type { Person } from "./types";

const ADMIN_INBOX = "Admin team · admin@aptech.dev";
const DRAFT_KEY = "apc-idea-draft-token";

/* ================= fee settings ================= */

export function feeSettings() {
  return readPaymentSettings();
}

export function feeLabel() {
  const { commitmentFee, currency } = feeSettings();
  return formatPrice(commitmentFee, currency);
}

const money = (p: Pick<IdeaPayment, "amount" | "currency">) => formatPrice(p.amount, p.currency);

/* ================= payment state ================= */

export type FeeState = "UNPAID" | Exclude<PaymentStatus, "FAILED">;

export const FEE_STATES: Record<FeeState, { label: string; className: string }> = {
  UNPAID: { label: "Fee unpaid", className: "bg-line text-muted" },
  PENDING: { label: "Paying…", className: "bg-blue-soft text-navy" },
  AWAITING_CONFIRMATION: { label: "Confirm payment", className: "bg-brand-soft text-brand-700" },
  PAID: { label: "Fee paid", className: "bg-teal-soft text-teal-700" },
};

export const REFUND_STATES: Record<RefundStatus, { label: string; className: string }> = {
  PENDING: { label: "Refund due", className: "bg-danger-soft text-danger" },
  PROCESSING: { label: "Refund processing", className: "bg-blue-soft text-navy" },
  REFUNDED: { label: "Refunded", className: "bg-mist text-muted" },
};

/** The latest attempt that hasn't failed. */
export function currentPayment(idea: Idea): IdeaPayment | undefined {
  const list = idea.payments ?? [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i].status !== "FAILED") return list[i];
  return undefined;
}

export function lastFailedPayment(idea: Idea): IdeaPayment | undefined {
  const last = idea.payments?.at(-1);
  return last?.status === "FAILED" ? last : undefined;
}

export function feeState(idea: Idea): FeeState {
  return (currentPayment(idea)?.status as FeeState | undefined) ?? "UNPAID";
}

export function paidPayment(idea: Idea) {
  return idea.payments?.find((p) => p.status === "PAID");
}

/** Why an admin can't approve this idea yet, or null when the fee is confirmed. */
export function paymentBlocker(idea: Idea): string | null {
  const state = feeState(idea);
  if (state === "PAID") return null;
  if (state === "AWAITING_CONFIRMATION") return `Confirm the client's ${feeLabel()} transfer before approving this idea.`;
  return `The client hasn't paid the ${feeLabel()} commitment fee yet, so this idea can't be approved.`;
}

/* ================= drafts ================= */

export function resumeLink(idea: Idea) {
  return idea.draftToken ? `/?resume=${encodeURIComponent(idea.draftToken)}` : null;
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

/** The unfinished application saved in this browser, if it's still a draft. */
export function rememberedDraft(): Idea | undefined {
  try {
    const token = localStorage.getItem(DRAFT_KEY);
    const idea = token ? findDraft(token) : undefined;
    if (idea?.status === "DRAFT") return idea;
    if (token) localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* private mode */
  }
  return undefined;
}

export function findDraft(token: string): Idea | undefined {
  return token ? readIdeas().find((i) => i.draftToken === token) : undefined;
}

export type DraftFields = Omit<IdeaInput, "location"> & { location?: string };

function sendResumeEmail(idea: Idea, intro: string) {
  sendNotice({
    audience: "client",
    channel: "email",
    to: `${idea.name || "Applicant"} · ${idea.email}`,
    subject: `Continue your application: ${idea.title || "your idea"} (${idea.ref})`,
    body: `${intro}\n\nPick up where you stopped: ${resumeLink(idea)}\n\nKeep this link private. It opens your saved application and your project wallet.`,
  });
}

const withLocation = (f: DraftFields) => ({ ...f, location: f.state && f.country ? `${f.state}, ${f.country}` : (f.location ?? "") });

/** Creates a saved draft as soon as we know the client's email, and emails them a link to continue. */
export function createDraft(fields: DraftFields, step: number, startedBy?: Person): Idea {
  const now = new Date().toISOString();
  const idea: Idea = {
    ...withLocation(fields),
    id: uid(),
    ref: randomRef(),
    submittedAt: now,
    lastSavedAt: now,
    status: "DRAFT",
    draftToken: randomToken(),
    draftStep: step,
    startedBy: startedBy?.name,
    payments: [],
  };
  addIdea(idea);
  sendResumeEmail(
    idea,
    startedBy
      ? `Hi ${idea.name},\n\n${startedBy.name} started your AI Project Connect application at our centre. Add the remaining details and pay the ${feeLabel()} commitment fee to send it to our engineers.`
      : `Hi ${idea.name},\n\nWe saved your application. You can close the page and come back anytime.`,
  );
  if (startedBy) logActivity(startedBy, `Started a walk-in application for ${idea.name} (${idea.ref})`);
  return idea;
}

export function saveDraft(token: string, fields: DraftFields, step: number): Idea | undefined {
  const idea = findDraft(token);
  if (!idea || idea.status !== "DRAFT") return idea;
  updateIdea(idea.id, { ...withLocation(fields), draftStep: step, lastSavedAt: new Date().toISOString() });
  return findIdeaById(idea.id);
}

/** Emails a continue link for every open draft under this email. Callers must show the same message either way. */
export function emailResumeLinks(email: string): Idea[] {
  const drafts = readIdeas().filter((i) => i.status === "DRAFT" && i.email.trim().toLowerCase() === email.trim().toLowerCase());
  drafts.forEach((d) => sendResumeEmail(d, `Hi ${d.name || "there"},\n\nHere's the link to finish your application.`));
  return drafts;
}

/** Sections still missing before a draft can be submitted. */
export function draftMissing(idea: Pick<Idea, "name" | "email" | "phone" | "country" | "state" | "title" | "category" | "platforms" | "problem" | "targetUsers" | "features" | "budget" | "timeline">) {
  const missing: string[] = [];
  if (idea.name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(idea.email) || idea.phone.replace(/\D/g, "").length < 10 || !idea.country || !idea.state) missing.push("About you");
  if (idea.title.trim().length < 2 || !idea.category || idea.platforms.length === 0 || idea.problem.trim().length < 15 || idea.targetUsers.trim().length < 5 || idea.features.trim().length < 10) missing.push("Your idea");
  if (!idea.budget || !idea.timeline) missing.push("Budget & timeline");
  return missing;
}

/* ================= paying ================= */

const receiptNo = (idea: Idea) => {
  const d = new Date();
  return `RCPT-${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}-${idea.ref.slice(5)}`;
};

function patchPayment(idea: Idea, paymentId: string, patch: Partial<IdeaPayment>) {
  updateIdea(idea.id, { payments: (idea.payments ?? []).map((p) => (p.id === paymentId ? { ...p, ...patch } : p)) });
}

function sendReceipt(idea: Idea, payment: IdeaPayment) {
  sendNotice({
    audience: "client",
    channel: "email+sms",
    to: `${idea.name} · ${idea.email}`,
    subject: `Receipt ${payment.receiptNo}: commitment fee paid`,
    body: `Hi ${idea.name},\n\nWe received your ${money(payment)} commitment fee for ${idea.title || idea.ref}.\n\nReceipt: ${payment.receiptNo}\nReference: ${payment.reference}\nMethod: ${payment.atCentre ? "Paid at an Aptech centre" : payment.method === "paystack" ? "Paystack" : "Bank transfer"}\nDate: ${new Date(payment.paidAt!).toDateString()}\n\nIf we can't take your idea on, we'll refund this in full.`,
  });
}

/** Opens a Paystack checkout. On the real server this calls /transaction/initialize. */
export function startPaystack(token: string): { ok: true; reference: string; amount: number; currency: string; email: string } | { ok: false; error: string } {
  const idea = findDraft(token);
  if (!idea || idea.status !== "DRAFT") return { ok: false, error: "This application can no longer be paid." };
  const state = feeState(idea);
  if (state === "PAID" || state === "AWAITING_CONFIRMATION") return { ok: false, error: "Your commitment fee is already recorded." };
  const { commitmentFee, currency, paystackEnabled } = feeSettings();
  if (!paystackEnabled) return { ok: false, error: "Card payments are turned off. Please use bank transfer." };
  const payment: IdeaPayment = { id: uid(), method: "paystack", status: "PENDING", amount: commitmentFee, currency, reference: `PSK-${randomCode(8)}`, createdAt: new Date().toISOString() };
  // Replace an abandoned Paystack attempt instead of stacking them up.
  const kept = (idea.payments ?? []).filter((p) => p.status !== "PENDING");
  updateIdea(idea.id, { payments: [...kept, payment] });
  return { ok: true, reference: payment.reference, amount: payment.amount, currency: payment.currency, email: idea.email };
}

/**
 * Paystack's result. In production only the signed webhook / server-side verify call
 * reaches this point; the browser redirect never marks a payment as paid.
 */
export function completePaystack(reference: string, success: boolean): Idea | undefined {
  const idea = readIdeas().find((i) => i.payments?.some((p) => p.reference === reference));
  const payment = idea?.payments?.find((p) => p.reference === reference);
  if (!idea || !payment || payment.status !== "PENDING") return idea;
  if (!success) {
    patchPayment(idea, payment.id, { status: "FAILED", failureReason: "Payment was cancelled or declined." });
    return findIdeaById(idea.id);
  }
  const paid: IdeaPayment = { ...payment, status: "PAID", paidAt: new Date().toISOString(), receiptNo: receiptNo(idea) };
  patchPayment(idea, payment.id, paid);
  sendReceipt(idea, paid);
  logActivity("Paystack", `Commitment fee paid online for ${idea.ref} (${money(paid)}, ${paid.reference})`);
  return findIdeaById(idea.id);
}

export interface ManualClaim {
  senderName: string;
  senderBank: string;
  transferDate: string;
  proof?: StoredFileMeta;
  refundAccount: RefundAccount;
}

/** "I have sent the money": waits for an admin to confirm the transfer. */
export function claimManualPayment(token: string, claim: ManualClaim): { ok: true } | { ok: false; error: string } {
  const idea = findDraft(token);
  if (!idea || idea.status !== "DRAFT") return { ok: false, error: "This application can no longer be paid." };
  const state = feeState(idea);
  if (state === "PAID" || state === "AWAITING_CONFIRMATION") return { ok: false, error: "Your commitment fee is already recorded." };
  const { commitmentFee, currency } = feeSettings();
  const payment: IdeaPayment = {
    id: uid(),
    method: "manual",
    status: "AWAITING_CONFIRMATION",
    amount: commitmentFee,
    currency,
    reference: `TRF-${idea.ref.slice(5)}${(idea.payments?.length ?? 0) ? `-${(idea.payments?.length ?? 0) + 1}` : ""}`,
    createdAt: new Date().toISOString(),
    senderName: claim.senderName,
    senderBank: claim.senderBank,
    transferDate: claim.transferDate,
    proof: claim.proof,
  };
  updateIdea(idea.id, { payments: [...(idea.payments ?? []).filter((p) => p.status !== "PENDING"), payment], refundAccount: claim.refundAccount });
  sendNotice({
    audience: "client",
    channel: "email",
    to: `${idea.name} · ${idea.email}`,
    subject: `We're checking your transfer (${idea.ref})`,
    body: `Hi ${idea.name},\n\nThanks! We'll confirm your ${money(payment)} transfer from ${claim.senderName} (${claim.senderBank}) within ${feeSettings().confirmationTime} and email your receipt.`,
  });
  notifyStaff(ADMIN_INBOX, `Confirm a transfer: ${money(payment)} for ${idea.ref}`, `${claim.senderName} says they sent ${money(payment)} from ${claim.senderBank} on ${claim.transferDate}${claim.proof ? " and attached proof" : ""}. Check the account and confirm it under Payments.`);
  logActivity(`${idea.name} (Client)`, `Reported a bank transfer for ${idea.ref} (${money(payment)})`);
  return { ok: true };
}

export function updateRefundAccount(token: string, account: RefundAccount) {
  const idea = findDraft(token);
  if (idea) updateIdea(idea.id, { refundAccount: account });
}

/** Sends the draft to the team. Needs a complete form and a paid (or reported) fee. */
export function submitDraft(token: string): { ok: true; idea: Idea } | { ok: false; error: string } {
  const idea = findDraft(token);
  if (!idea) return { ok: false, error: "We couldn't find this application." };
  if (idea.status !== "DRAFT") return { ok: false, error: "This application was already submitted." };
  const missing = draftMissing(idea);
  if (missing.length) return { ok: false, error: `Finish these sections first: ${missing.join(", ")}.` };
  const state = feeState(idea);
  if (state !== "PAID" && state !== "AWAITING_CONFIRMATION") return { ok: false, error: `Fund your project wallet with the ${feeLabel()} commitment fee to submit.` };

  const now = new Date().toISOString();
  updateIdea(idea.id, { status: "NEW", submittedAt: now, lastSavedAt: now });
  const { responseTime } = readSiteContent().ideaForm;
  sendNotice({
    audience: "client",
    channel: "email",
    to: `${idea.name} · ${idea.email}`,
    subject: `We received your idea (${idea.ref})`,
    body: `Thanks for sharing ${idea.title}. We'll send a proposal within ${responseTime}${state === "AWAITING_CONFIRMATION" ? " once we confirm your transfer" : ""}. Check progress anytime with reference ${idea.ref}.`,
  });
  notifyStaff(ADMIN_INBOX, `New idea submitted: ${idea.title}`, `${idea.name} (${idea.location}) · ${idea.category} · ${idea.budget} · fee ${state === "PAID" ? "paid" : "awaiting confirmation"}${idea.attachment ? ` · PDF brief attached (${idea.attachment.name})` : ""}`);
  logActivity(`${idea.name} (Client)`, `Submitted idea ${idea.ref}`);
  forgetDraft();
  return { ok: true, idea: findIdeaById(idea.id)! };
}

/* ================= staff actions ================= */

export function confirmPayment(ideaId: string, actor: Person) {
  const idea = findIdeaById(ideaId);
  const payment = idea && currentPayment(idea);
  if (!idea || payment?.status !== "AWAITING_CONFIRMATION") return;
  const now = new Date().toISOString();
  const paid: IdeaPayment = { ...payment, status: "PAID", paidAt: now, confirmedAt: now, confirmedBy: actor.name, receiptNo: receiptNo(idea) };
  patchPayment(idea, payment.id, paid);
  sendReceipt(idea, paid);
  logActivity(actor, `Confirmed the ${money(paid)} transfer for ${idea.ref} (${paid.reference})`);
}

export function rejectPayment(ideaId: string, reason: string, actor: Person) {
  const idea = findIdeaById(ideaId);
  const payment = idea && currentPayment(idea);
  if (!idea || payment?.status !== "AWAITING_CONFIRMATION") return;
  patchPayment(idea, payment.id, { status: "FAILED", failureReason: reason, confirmedBy: actor.name, confirmedAt: new Date().toISOString() });
  sendNotice({
    audience: "client",
    channel: "email+sms",
    to: `${idea.name} · ${idea.email}`,
    subject: `We couldn't find your transfer (${idea.ref})`,
    body: `Hi ${idea.name},\n\nWe checked our account but couldn't match your ${money(payment)} transfer: ${reason}\n\nOpen your application to pay again or send the correct details: ${resumeLink(idea)}`,
  });
  logActivity(actor, `Marked the transfer for ${idea.ref} as not received: ${reason}`);
}

/** Cash or transfer received at an Aptech centre, confirmed in one step. */
export function recordCentrePayment(ideaId: string, note: string, actor: Person) {
  const idea = findIdeaById(ideaId);
  if (!idea || feeState(idea) === "PAID") return;
  const { commitmentFee, currency } = feeSettings();
  const now = new Date().toISOString();
  const payment: IdeaPayment = {
    id: uid(),
    method: "manual",
    status: "PAID",
    amount: commitmentFee,
    currency,
    reference: `CTR-${randomCode(6)}`,
    createdAt: now,
    paidAt: now,
    atCentre: true,
    note: note || "Paid at centre",
    confirmedAt: now,
    confirmedBy: actor.name,
    receiptNo: receiptNo(idea),
  };
  updateIdea(idea.id, { payments: [...(idea.payments ?? []).filter((p) => p.status === "FAILED" || p.status === "PAID"), payment] });
  sendReceipt(idea, payment);
  logActivity(actor, `Recorded a ${money(payment)} commitment fee paid at the centre for ${idea.ref}`);
}

/** Declines the idea. A paid fee is queued for a full refund. */
export function declineIdea(ideaId: string, actor: Person, reason = "Idea declined by the team"): { ok: true; refundQueued: boolean } | { ok: false; error: string } {
  const idea = findIdeaById(ideaId);
  if (!idea) return { ok: false, error: "Idea not found." };
  if (feeState(idea) === "AWAITING_CONFIRMATION") return { ok: false, error: "Confirm or reject the client's transfer first, so we know whether to refund it." };
  const paid = paidPayment(idea);
  const refundQueued = Boolean(paid && !paid.refund);
  updateIdea(idea.id, {
    status: "DECLINED",
    payments: (idea.payments ?? []).map((p) => (p === paid && refundQueued ? { ...p, refund: { status: "PENDING" as const, queuedAt: new Date().toISOString(), reason } } : p)),
  });
  sendNotice({
    audience: "client",
    channel: "email",
    to: `${idea.name} · ${idea.email}`,
    subject: `An update on ${idea.title}`,
    body: `Hi ${idea.name},\n\nThank you for sharing ${idea.title} with us. After review, we're not able to take it on right now.${refundQueued ? `\n\nWe're refunding your ${money(paid!)} commitment fee in full. ${paid!.method === "paystack" ? "It goes back to the card or account you paid with." : "It goes to the refund account you gave us."}` : ""}`,
  });
  logActivity(actor, `Declined idea ${idea.ref}${refundQueued ? " and queued a commitment fee refund" : ""}`);
  return { ok: true, refundQueued };
}

/**
 * Paystack payments are refunded through Paystack's refund API (PROCESSING until
 * Paystack's refund.processed webhook). Manual payments are refunded by bank transfer.
 */
export function startRefund(ideaId: string, actor: Person, manual?: { reference: string; note?: string }) {
  const idea = findIdeaById(ideaId);
  const paid = idea && paidPayment(idea);
  if (!idea || !paid?.refund || paid.refund.status === "REFUNDED") return;
  const now = new Date().toISOString();
  if (paid.method === "paystack" && !manual) {
    patchPayment(idea, paid.id, { refund: { ...paid.refund, status: "PROCESSING", reference: `RFD-${randomCode(8)}`, by: actor.name } });
    logActivity(actor, `Started a Paystack refund of ${money(paid)} for ${idea.ref}`);
    return;
  }
  patchPayment(idea, paid.id, { refund: { ...paid.refund, status: "REFUNDED", reference: manual?.reference, note: manual?.note, by: actor.name, completedAt: now } });
  notifyRefunded(idea, paid);
  logActivity(actor, `Refunded ${money(paid)} to ${idea.name} for ${idea.ref}${manual?.reference ? ` (${manual.reference})` : ""}`);
}

/** Paystack confirmed the refund (refund.processed webhook on the real server). */
export function markRefundProcessed(ideaId: string, actor: Person | string = "Paystack") {
  const idea = findIdeaById(ideaId);
  const paid = idea && paidPayment(idea);
  if (!idea || paid?.refund?.status !== "PROCESSING") return;
  patchPayment(idea, paid.id, { refund: { ...paid.refund, status: "REFUNDED", completedAt: new Date().toISOString() } });
  notifyRefunded(idea, paid);
  logActivity(actor, `Refund of ${money(paid)} completed for ${idea.ref}`);
}

function notifyRefunded(idea: Idea, paid: IdeaPayment) {
  sendNotice({
    audience: "client",
    channel: "email+sms",
    to: `${idea.name} · ${idea.email}`,
    subject: `Your ${money(paid)} refund is on its way`,
    body: `Hi ${idea.name},\n\nWe've refunded your commitment fee for ${idea.title} (receipt ${paid.receiptNo}). ${paid.method === "paystack" ? "Banks usually show it within 5 working days." : idea.refundAccount ? `It was sent to ${idea.refundAccount.name}, ${idea.refundAccount.bank} ${idea.refundAccount.number}.` : ""}`,
  });
}

export interface WalkInApplication {
  name: string;
  email: string;
  phone: string;
  organisation?: string;
  country: string;
  state: string;
  title: string;
  category: string;
  platforms: string[];
  budget: string;
  brief?: StoredFileMeta;
  paidAtCentre?: { note: string };
}

/** Walk-in clients follow the same flow: the admin starts it, the client finishes and pays from the emailed link. */
export function startWalkInApplication(input: WalkInApplication, actor: Person): Idea {
  const idea = createDraft(
    {
      name: input.name,
      email: input.email,
      phone: input.phone,
      organisation: input.organisation,
      country: input.country,
      state: input.state,
      title: input.title,
      category: input.category,
      platforms: input.platforms,
      problem: "",
      targetUsers: "",
      features: "",
      budget: input.budget,
      timeline: "",
      nda: true,
      attachment: input.brief,
    },
    1,
    actor,
  );
  if (input.paidAtCentre) recordCentrePayment(idea.id, input.paidAtCentre.note, actor);
  return findIdeaById(idea.id)!;
}

/* ================= wallet & reports ================= */

export interface LedgerEntry {
  id: string;
  label: string;
  detail: string;
  amount: number;
  currency: string;
  /** +1 money in, -1 money back out, 0 informational. */
  direction: 1 | -1 | 0;
  status: string;
  tone: "good" | "wait" | "bad" | "muted";
  at: string;
}

export function walletLedger(idea: Idea): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (const p of idea.payments ?? []) {
    const how = p.atCentre ? "Paid at an Aptech centre" : p.method === "paystack" ? "Card / bank via Paystack" : `Bank transfer from ${p.senderName ?? "you"}`;
    entries.push({
      id: p.id,
      label: "Commitment fee",
      detail: `${how} · ${p.receiptNo ?? p.reference}`,
      amount: p.amount,
      currency: p.currency,
      direction: p.status === "PAID" ? 1 : 0,
      status: { PENDING: "Not completed", AWAITING_CONFIRMATION: "Checking transfer", PAID: "Paid", FAILED: p.failureReason ? `Failed: ${p.failureReason}` : "Failed" }[p.status],
      tone: p.status === "PAID" ? "good" : p.status === "FAILED" ? "bad" : p.status === "PENDING" ? "muted" : "wait",
      at: p.paidAt ?? p.createdAt,
    });
    if (p.refund) {
      entries.push({
        id: `${p.id}-refund`,
        label: "Refund",
        detail: p.refund.reason + (p.refund.reference ? ` · ${p.refund.reference}` : ""),
        amount: p.amount,
        currency: p.currency,
        direction: p.refund.status === "REFUNDED" ? -1 : 0,
        status: { PENDING: "Queued", PROCESSING: "Processing", REFUNDED: "Refunded" }[p.refund.status],
        tone: p.refund.status === "REFUNDED" ? "good" : "wait",
        at: p.refund.completedAt ?? p.refund.queuedAt,
      });
    }
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

export function walletBalance(idea: Idea) {
  return walletLedger(idea).reduce((sum, e) => sum + e.direction * e.amount, 0);
}

export function feeSummary(ideas: Idea[]) {
  let collected = 0;
  let refunded = 0;
  let awaiting = 0;
  let refundsDue = 0;
  for (const idea of ideas) {
    for (const p of idea.payments ?? []) {
      if (p.status === "PAID") collected += p.amount;
      if (p.status === "AWAITING_CONFIRMATION") awaiting++;
      if (p.refund?.status === "REFUNDED") refunded += p.amount;
      else if (p.refund) refundsDue++;
    }
  }
  return { collected, refunded, net: collected - refunded, awaiting, refundsDue };
}
