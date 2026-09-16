"use client";

import { createCollection } from "./collection";

export type IdeaStatus = "NEW" | "REVIEWING" | "QUOTE_SENT" | "ACCEPTED" | "DECLINED";

export interface Idea {
  id: string;
  ref: string;
  submittedAt: string;
  name: string;
  email: string;
  phone: string;
  organisation?: string;
  location: string;
  title: string;
  category: string;
  platforms: string[];
  problem: string;
  targetUsers: string;
  features: string;
  budget: string;
  timeline: string;
  nda: boolean;
  status: IdeaStatus;
  notes?: string;
  projectCode?: string;
}

export type IdeaInput = Omit<Idea, "id" | "ref" | "submittedAt" | "status" | "notes" | "projectCode">;

export const IDEA_STATUSES: Record<IdeaStatus, { label: string; className: string }> = {
  NEW: { label: "New", className: "bg-brand text-white" },
  REVIEWING: { label: "Under review", className: "bg-blue-soft text-navy" },
  QUOTE_SENT: { label: "Quote sent", className: "bg-brand-soft text-brand-700" },
  ACCEPTED: { label: "Accepted", className: "bg-teal text-white" },
  DECLINED: { label: "Declined", className: "bg-line text-muted" },
};

export const CATEGORIES = ["Marketplace", "E-commerce", "Fintech", "Health", "Education", "Logistics", "Agriculture", "Social / Community", "Other"];
export const PLATFORMS = ["Website", "Android app", "iPhone app", "Admin dashboard"];
export const BUDGETS = ["Under ₦1M", "₦1M – ₦3M", "₦3M – ₦7M", "₦7M – ₦15M", "Above ₦15M", "Not sure yet"];
export const TIMELINES = ["As soon as possible", "1 – 3 months", "3 – 6 months", "6+ months", "Flexible"];

function daysAgo(n: number, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
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
    location: "Ibadan, Nigeria",
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
  },
  {
    id: "i3",
    ref: "IDEA-2VN9K",
    submittedAt: daysAgo(6, 11),
    name: "Yusuf Danjuma",
    email: "yusuf@agrocold.com",
    phone: "+234 902 777 1180",
    location: "Kano, Nigeria",
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
  },
];

const ideas = createCollection<Idea>("apc-demo-ideas-v1", SEED);

export const useIdeas = () => ideas.useItems();

export const readIdeas = () => ideas.read();

export function findIdea(ref: string) {
  return ideas.read().find((i) => i.ref === ref.trim().toUpperCase());
}

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

export function submitIdea(input: IdeaInput): Idea {
  const idea: Idea = {
    ...input,
    id: Math.random().toString(36).slice(2, 10),
    ref: `IDEA-${randomCode(5)}`,
    submittedAt: new Date().toISOString(),
    status: "NEW",
  };
  ideas.set((all) => [idea, ...all]);
  return idea;
}

export function updateIdea(id: string, patch: Partial<Idea>) {
  ideas.set((all) => all.map((i) => (i.id === id ? { ...i, ...patch } : i)));
}

export function resetIdeas() {
  ideas.reset();
}
