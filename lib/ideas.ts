"use client";

/**
 * The idea inbox, backed by /api/staff/ideas.
 *
 * The server owns everything here: references, statuses, the commitment fee and the
 * conversion into a project. This file only describes the JSON it sends back and wraps
 * the four endpoints staff use. The public side of an application (drafts, paying the
 * fee, submitting) lives in wallet.ts.
 *
 * Every idea carries its own money with it: `paymentStatus` and `payment` are the
 * current commitment fee attempt, and `wallet` is the ledger shown to the client.
 * wallet.ts has the helpers that read them.
 */
import { useMemo } from "react";
import { api, query } from "./api";
import { useApi } from "./remote";
import { KEYS, refreshIdeas, refreshProjects } from "./store";

export type IdeaStatus = "DRAFT" | "NEW" | "REVIEWING" | "QUOTE_SENT" | "ACCEPTED" | "DECLINED";

/** Statuses staff can set. DRAFT belongs to the client, ACCEPTED to the convert endpoint. */
export type IdeaStatusChange = "NEW" | "REVIEWING" | "QUOTE_SENT" | "DECLINED";

/** How the application started: on the website, or at a centre with an admin. */
export type IdeaSource = "online" | "walk_in";

export type PaymentMethod = "paystack" | "manual";

/** The status of one payment attempt. */
export type PaymentStatus = "PENDING" | "AWAITING_CONFIRMATION" | "PAID" | "FAILED";

/** The fee status of the idea as a whole: the current attempt, or UNPAID when there is none. */
export type FeeState = "UNPAID" | PaymentStatus;

export type RefundStatus = "NONE" | "PENDING" | "PROCESSING" | "REFUNDED";

export const IDEA_STATUSES: Record<IdeaStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-mist text-muted" },
  NEW: { label: "New", className: "bg-brand text-white" },
  REVIEWING: { label: "Under review", className: "bg-blue-soft text-navy" },
  QUOTE_SENT: { label: "Quote sent", className: "bg-brand-soft text-brand-700" },
  ACCEPTED: { label: "Accepted", className: "bg-teal text-white" },
  DECLINED: { label: "Declined", className: "bg-line text-muted" },
};

/* ================= payments ================= */

/** Proof of a bank transfer. `url` is only sent to staff. */
export interface ProofFile {
  name: string;
  size: number;
  type: string;
  url?: string;
}

/** The "I have sent the money" details, for bank transfers only. */
export interface ManualTransfer {
  senderName: string | null;
  senderBank: string | null;
  /** What the client says they sent, which can be more than the fee. */
  amountClaimed: number | null;
  /** YYYY-MM-DD */
  transferDate: string | null;
  note: string | null;
  proof: ProofFile | null;
}

/** Where a bank transfer is refunded to. */
export interface RefundAccount {
  accountName: string;
  accountNumber: string;
  bankName: string;
}

export interface Refund {
  status: RefundStatus;
  reference: string | null;
  note: string | null;
  queuedAt: string | null;
  /** When it was completed. */
  at: string | null;
}

/**
 * The commitment fee attempt that counts for an idea. The server always sends one:
 * with no payment yet it is an empty shell with `status: "UNPAID"`.
 * The fields at the bottom only come with a staff session.
 */
export interface IdeaPayment {
  /** Staff only; the public application view leaves it out. */
  id?: number | null;
  status: FeeState;
  method: PaymentMethod | null;
  amount: number;
  amountKobo: number;
  currency: string;
  reference: string | null;
  receiptNo: string | null;
  paidAt: string | null;
  createdAt: string | null;
  failureReason: string | null;
  manual: ManualTransfer | null;
  refundAccount: RefundAccount | null;
  refund: Refund;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  refundedBy?: string | null;
  /** The admin who recorded a payment taken at a centre. */
  recordedBy?: string | null;
  paystackTransactionId?: number | null;
  /** How Paystack was paid: card, bank, ussd… */
  channel?: string | null;
}

/**
 * One line of the client's wallet: the fee itself, each payment and any refund.
 * `status` is a FeeState, PaymentStatus or RefundStatus depending on `type`.
 */
export interface WalletEntry {
  type: "fee" | "payment" | "refund";
  label: string;
  amount: number;
  currency: string;
  status: string;
  reference: string | null;
  at: string | null;
  method?: PaymentMethod | null;
  receiptNo?: string | null;
  note?: string | null;
}

/* ================= ideas ================= */

export interface Quote {
  id: number;
  amount: number;
  currency: string;
  summary: string;
  timelineWeeks: number | null;
  /** YYYY-MM-DD */
  validUntil: string;
  /** Sent, and past its date. */
  expired: boolean;
  status: "sent" | "accepted" | "declined" | "withdrawn";
  leadName: string | null;
  /** YYYY-MM-DD */
  targetDate: string;
  sentAt: string | null;
  respondedAt: string | null;
  acceptedName: string | null;
  clientNote: string | null;
  /** `size` is already human-readable here, e.g. "1.2 MB". */
  proposal: { name: string; size: string; url: string } | null;
}

/** The client's PDF brief. `url` needs a staff session. */
export interface IdeaAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

/**
 * An idea as the inbox sees it. Fields are nullable while it is still a DRAFT,
 * because the client fills them in over several visits.
 */
export interface Idea {
  id: number;
  ref: string;
  /** Null until it is submitted. */
  submittedAt: string | null;
  createdAt: string | null;
  lastSavedAt: string | null;
  source: IdeaSource;
  name: string | null;
  email: string;
  phone: string | null;
  organisation: string | null;
  /** Display string built from state and country, e.g. "Oyo, Nigeria". */
  location: string;
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
  status: IdeaStatus;
  notes: string | null;
  /** Set once it has been registered as a project. */
  projectCode: string | null;
  attachment: IdeaAttachment | null;
  quote: Quote | null;
  paymentStatus: FeeState;
  payment: IdeaPayment;
  wallet: WalletEntry[];
}

export interface IdeaFilters {
  status?: IdeaStatus;
  q?: string;
  payment?: FeeState;
  /** Admins only: include applications the client hasn't submitted yet. */
  includeDrafts?: boolean;
}

/* ================= reading ================= */

/** The last list loaded from the server, so non-React code can read it synchronously. */
let snapshot: Idea[] = [];

/** The idea inbox. Drafts are left out unless an admin asks for them. */
export function useIdeas(filters: IdeaFilters = {}) {
  const { status, q, payment, includeDrafts } = filters;
  const path = KEYS.ideas + query({ status, q, payment, includeDrafts: includeDrafts ? 1 : undefined });
  const { data, loading, error, refresh } = useApi<Idea[]>(path);
  const ideas = useMemo(() => {
    // Only the unfiltered list is worth keeping for sync readers.
    if (data && path === KEYS.ideas) snapshot = data;
    return data ?? [];
  }, [data, path]);
  return { ideas, loading, error, refresh };
}

export const readIdeas = () => snapshot;

/** One idea with its quote, brief and wallet. */
export function useIdea(id: number | null) {
  return useApi<Idea>(id ? `${KEYS.ideas}/${id}` : null);
}

/* ================= changing ================= */

/**
 * Moves an idea along or saves the review notes.
 * The server refuses QUOTE_SENT until the fee is paid, and DECLINED while a transfer
 * is waiting to be confirmed. Declining a paid idea queues its refund; reopening it cancels that.
 */
export async function updateIdea(id: number, patch: { status?: IdeaStatusChange; notes?: string | null }) {
  const idea = await api.patch<Idea>(`${KEYS.ideas}/${id}`, patch);
  await refreshIdeas();
  return idea;
}

/** Accept & convert (admin): creates the client, registers the project and emails the Project ID. */
export async function convertIdea(id: number, input: { leadId: number; targetDate: string; startDate?: string }) {
  const result = await api.post<{ projectCode: string; idea: Idea }>(`${KEYS.ideas}/${id}/convert`, input);
  await Promise.all([refreshIdeas(), refreshProjects()]);
  return result;
}
