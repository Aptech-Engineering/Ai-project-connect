"use client";

import { createCollection } from "./collection";
import type { StoredFileMeta } from "./files";

export type IdeaStatus = "DRAFT" | "NEW" | "REVIEWING" | "QUOTE_SENT" | "ACCEPTED" | "DECLINED";

export type PaymentStatus = "PENDING" | "AWAITING_CONFIRMATION" | "PAID" | "FAILED";
export type RefundStatus = "PENDING" | "PROCESSING" | "REFUNDED";

/** One attempt to pay the commitment fee. The latest non-failed attempt is the current one. */
export interface IdeaPayment {
  id: string;
  method: "paystack" | "manual";
  status: PaymentStatus;
  amount: number;
  currency: string;
  reference: string;
  createdAt: string;
  paidAt?: string;
  receiptNo?: string;
  /** Manual transfer details from "I have sent the money". */
  senderName?: string;
  senderBank?: string;
  transferDate?: string;
  proof?: StoredFileMeta;
  /** Recorded by staff for cash or transfer received at a centre. */
  atCentre?: boolean;
  note?: string;
  confirmedBy?: string;
  confirmedAt?: string;
  failureReason?: string;
  refund?: { status: RefundStatus; queuedAt: string; reason: string; reference?: string; note?: string; by?: string; completedAt?: string };
}

export interface RefundAccount {
  name: string;
  number: string;
  bank: string;
}

export interface Quote {
  id: string;
  amount: number;
  currency: string;
  summary: string;
  timelineWeeks?: number;
  /** YYYY-MM-DD */
  validUntil: string;
  proposal?: StoredFileMeta;
  leadName: string;
  /** YYYY-MM-DD */
  targetDate: string;
  /** Secret for the client's private quote link (hashed on the real server). */
  token: string;
  status: "sent" | "accepted" | "declined" | "withdrawn";
  sentAt: string;
  sentBy: string;
  respondedAt?: string;
  acceptedName?: string;
  clientNote?: string;
}

export interface Idea {
  id: string;
  ref: string;
  submittedAt: string;
  name: string;
  email: string;
  phone: string;
  organisation?: string;
  /** Display string, e.g. "Ibadan, Oyo, Nigeria". */
  location: string;
  country?: string;
  state?: string;
  title: string;
  category: string;
  platforms: string[];
  problem: string;
  targetUsers: string;
  features: string;
  budget: string;
  timeline: string;
  nda: boolean;
  /** Optional PDF brief uploaded by the client. */
  attachment?: StoredFileMeta;
  status: IdeaStatus;
  notes?: string;
  projectCode?: string;
  quote?: Quote;
  /** Secret for the client's "continue your application" link (hashed on the real server). */
  draftToken?: string;
  lastSavedAt?: string;
  /** Wizard step the client stopped on. */
  draftStep?: number;
  /** Set when an admin started the application for a walk-in client. */
  startedBy?: string;
  payments?: IdeaPayment[];
  refundAccount?: RefundAccount;
}

export type IdeaInput = Omit<Idea, "id" | "ref" | "submittedAt" | "status" | "notes" | "projectCode" | "quote" | "draftToken" | "lastSavedAt" | "draftStep" | "startedBy" | "payments" | "refundAccount">;

export const IDEA_STATUSES: Record<IdeaStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-mist text-muted" },
  NEW: { label: "New", className: "bg-brand text-white" },
  REVIEWING: { label: "Under review", className: "bg-blue-soft text-navy" },
  QUOTE_SENT: { label: "Quote sent", className: "bg-brand-soft text-brand-700" },
  ACCEPTED: { label: "Accepted", className: "bg-teal text-white" },
  DECLINED: { label: "Declined", className: "bg-line text-muted" },
};


function daysAgo(n: number, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
}

function paid(method: IdeaPayment["method"], days: number, reference: string, receiptNo: string, extra: Partial<IdeaPayment> = {}): IdeaPayment {
  const at = daysAgo(days, 9);
  return { id: `pay-${reference}`, method, status: "PAID", amount: 2000, currency: "NGN", reference, receiptNo, createdAt: at, paidAt: at, ...(method === "manual" ? { confirmedAt: at } : {}), ...extra };
}

const SEED: Idea[] = [
  {
    id: "i1",
    ref: "IDEA-4QX7M",
    submittedAt: daysAgo(0, 9),
    name: "Bola Ogunleye",
    email: "bola@mechanicnow.ng",
    phone: "+234 803 555 0192",
    organisation: "MechanicNow",
    location: "Oyo, Nigeria",
    country: "Nigeria",
    state: "Oyo",
    title: "MechanicNow",
    category: "Logistics",
    platforms: ["Android app", "Admin dashboard"],
    problem: "When your car breaks down, finding a trusted mechanic nearby is hard and prices are unclear.",
    targetUsers: "Car owners in Ibadan and Lagos, and independent mechanics.",
    features: "Request a mechanic to your location, see price estimates upfront, rate mechanics, pay in the app.",
    budget: "₦3M – ₦7M",
    timeline: "3 – 6 months",
    nda: true,
    status: "NEW",
    payments: [paid("paystack", 0, "PSK-7Q2M9XK4", "RCPT-2609-4QX7M")],
  },
  {
    id: "i2",
    ref: "IDEA-8JD2P",
    submittedAt: daysAgo(2, 14),
    name: "Amaka Nwachukwu",
    email: "amaka@stylehub.africa",
    phone: "+234 816 222 4471",
    organisation: "StyleHub",
    location: "Enugu, Nigeria",
    country: "Nigeria",
    state: "Enugu",
    title: "StyleHub Tailors",
    category: "E-commerce",
    platforms: ["Website", "Android app"],
    problem: "Customers can't easily order custom clothes online and tailors lose track of measurements.",
    targetUsers: "Young professionals ordering native wear, and tailors managing orders.",
    features: "Save body measurements, pick styles, track sewing progress, WhatsApp reminders.",
    budget: "₦1M – ₦3M",
    timeline: "1 – 3 months",
    nda: false,
    status: "REVIEWING",
    notes: "Good fit for Flutter + Firebase. Book a call to confirm scope.",
    payments: [paid("paystack", 2, "PSK-3HN8V2TD", "RCPT-2609-8JD2P")],
  },
  {
    id: "i3",
    ref: "IDEA-2VN9K",
    submittedAt: daysAgo(6, 11),
    name: "Yusuf Danjuma",
    email: "yusuf@agrocold.com",
    phone: "+234 902 777 1180",
    location: "Kano, Nigeria",
    country: "Nigeria",
    state: "Kano",
    title: "AgroCold Storage Booking",
    category: "Agriculture",
    platforms: ["Website"],
    problem: "Farmers lose produce because they can't find or book cold storage space in time.",
    targetUsers: "Tomato and pepper farmers, cold room owners.",
    features: "See available cold rooms, book and pay per crate, SMS alerts before storage expires.",
    budget: "₦3M – ₦7M",
    timeline: "Flexible",
    nda: true,
    status: "QUOTE_SENT",
    notes: "Proposal sent: React + Node.js + PostgreSQL, 14 weeks.",
    payments: [paid("manual", 6, "TRF-2VN9K", "RCPT-2609-2VN9K", { senderName: "Yusuf Danjuma", senderBank: "GTBank", confirmedBy: "Aptech Dev Team" })],
  },
  {
    id: "i4",
    ref: "IDEA-6RW3H",
    submittedAt: daysAgo(1, 16),
    name: "Halima Bello",
    email: "halima@mamaput.ng",
    phone: "+234 809 314 2256",
    location: "FCT, Nigeria",
    country: "Nigeria",
    state: "FCT",
    title: "MamaPut Delivery",
    category: "Marketplace",
    platforms: ["Android app", "Website"],
    problem: "Local food vendors can't take delivery orders, so office workers only get fast-food chains.",
    targetUsers: "Office workers in Abuja and roadside food vendors.",
    features: "Browse nearby vendors, order and pay, rider pickup, vendor daily sales summary.",
    budget: "₦1M – ₦3M",
    timeline: "1 – 3 months",
    nda: false,
    status: "NEW",
    payments: [
      {
        id: "pay-i4",
        method: "manual",
        status: "AWAITING_CONFIRMATION",
        amount: 2000,
        currency: "NGN",
        reference: "TRF-6RW3H",
        createdAt: daysAgo(1, 16),
        senderName: "Halima Bello",
        senderBank: "Opay",
        transferDate: daysAgo(1, 16).slice(0, 10),
      },
    ],
    refundAccount: { name: "Halima Bello", number: "8093142256", bank: "Opay" },
  },
  {
    id: "i5",
    ref: "IDEA-9TB4C",
    submittedAt: daysAgo(9, 12),
    name: "Chidi Eze",
    email: "chidi@betpredict.io",
    phone: "+234 705 118 9043",
    location: "Lagos, Nigeria",
    country: "Nigeria",
    state: "Lagos",
    title: "BetPredict Tips",
    category: "Other",
    platforms: ["Website"],
    problem: "Sports fans want paid betting tips delivered by SMS.",
    targetUsers: "Sports bettors.",
    features: "Paid tips subscription, SMS delivery, win-rate tracker.",
    budget: "Under ₦1M",
    timeline: "As soon as possible",
    nda: false,
    status: "DECLINED",
    notes: "Outside what we build (gambling). Refund the commitment fee.",
    payments: [
      {
        ...paid("paystack", 9, "PSK-9TB4CW1Z", "RCPT-2609-9TB4C"),
        refund: { status: "PENDING", queuedAt: daysAgo(3, 11), reason: "Idea declined by the team" },
      },
    ],
  },
  {
    id: "i6",
    ref: "IDEA-5KP8S",
    submittedAt: daysAgo(0, 8),
    lastSavedAt: daysAgo(0, 8),
    draftToken: "demo-draft-5kp8s",
    draftStep: 3,
    name: "Tobi Adeyemi",
    email: "tobi@schoolpay.ng",
    phone: "+234 813 660 7781",
    location: "Ogun, Nigeria",
    country: "Nigeria",
    state: "Ogun",
    title: "SchoolPay",
    category: "Education",
    platforms: ["Website", "Android app"],
    problem: "Parents queue at banks to pay school fees and schools lose track of who has paid.",
    targetUsers: "Private schools and parents in Abeokuta.",
    features: "Pay fees online, instant receipts, reminders, bursar dashboard.",
    budget: "₦3M – ₦7M",
    timeline: "3 – 6 months",
    nda: true,
    status: "DRAFT",
  },
];

const ideas = createCollection<Idea>("apc-demo-ideas-v2", SEED);

export const useIdeas = () => ideas.useItems();

export const readIdeas = () => ideas.read();

export function findIdea(ref: string) {
  return ideas.read().find((i) => i.ref === ref.trim().toUpperCase());
}

export function findIdeaById(id: string) {
  return ideas.read().find((i) => i.id === id);
}

export function addIdea(idea: Idea) {
  ideas.set((all) => [idea, ...all]);
}

export function randomRef() {
  return `IDEA-${randomCode(5)}`;
}

export function randomToken(bytes = 24) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export { randomCode };

function randomCode(length: number) {
  // No 0/O/1/I so codes are easy to read out over the phone.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function newProjectCode(existing: string[]) {
  const yy = String(new Date().getFullYear()).slice(-2);
  let code = "";
  do code = `APC-${yy}-${randomCode(5)}`;
  while (existing.includes(code));
  return code;
}

export function updateIdea(id: string, patch: Partial<Idea>) {
  ideas.set((all) => all.map((i) => (i.id === id ? { ...i, ...patch } : i)));
}

export function resetIdeas() {
  ideas.reset();
}
