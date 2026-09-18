"use client";

import { useMemo } from "react";
import { api } from "./api";
import { invalidate, useApi } from "./remote";
import { STAGES } from "./data";
import type { StageKey } from "./types";

/**
 * Everything an admin can edit on the public site and client portal.
 * Managed in the Engineering Panel → Website.
 */

export interface LinkItem {
  label: string;
  /** A URL, an in-page anchor like #track, or #submit-idea to open the idea form. */
  href: string;
}

export interface Flier {
  id: string;
  enabled: boolean;
  title: string;
  text: string;
  imageId?: string;
  ctaLabel: string;
  ctaHref: string;
}

export const SUBMIT_IDEA_HREF = "#submit-idea";

export interface SupportPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  /** e.g. "month"; empty for one-off / no plan */
  period: string;
  description: string;
  features: string[];
}

export const DEFAULT_CONTENT = {
  brand: {
    name: "AI Project Connect",
    pageTitle: "AI Project Connect — We build your idea. You watch it grow.",
  },
  announcement: {
    enabled: false,
    text: "New cohort: 10% off every course for AI Project Connect clients this month.",
    linkLabel: "See courses",
    linkHref: "#courses",
  },
  nav: {
    links: [
      { label: "Track a project", href: "#track" },
      { label: "Learn the stack", href: "#courses" },
      { label: "Contact", href: "#contact" },
    ] as LinkItem[],
    ctaLabel: "Submit your idea",
  },
  hero: {
    eyebrow: "Live build tracking by Aptech engineers",
    titleLine1: "We build your idea.",
    titleLine2: "You watch it",
    highlight: "grow.",
    subtitleLead: "Then you learn the stack behind it.",
    subtitle: "Enter your Project ID to see your product's stage, progress and latest updates, written in plain language.",
    trackerLabel: "Check your project status",
    trackerPlaceholder: "Project ID (APC-26-7KQ9X) or idea reference",
    trackerButton: "Track project",
    showDemoIds: true,
    trustPoints: ["Project ID + one-time code", "No jargon, ever", "Learn what built your app"],
    showPreviewCard: true,
    marqueeTitle: "Stacks we build with",
    marqueeSubtitle: "and teach at Aptech",
  },
  fliers: {
    enabled: true,
    title: "Offers & announcements",
    subtitle: "Special programmes and discounts from Aptech.",
    items: [] as Flier[],
  },
  courses: {
    showOnHome: true,
    eyebrow: "Learn the stack",
    title: "Learn the tools we build with",
    subtitle: "Every product we build uses technologies taught at Aptech. Pick a course and start this season.",
    enquiryButton: "Request info",
    enrolButton: "Enrol now",
  },
  portal: {
    stackTitle: "What your app is built with",
    stackSubtitle: "The tools our engineers are using, explained simply.",
    discountLabel: "Client discount",
    counsellorPromise: "A course counsellor will call you within 24 hours.",
    stageMeanings: Object.fromEntries(Object.entries(STAGES).map(([k, v]) => [k, v.meaning])) as Record<StageKey, string>,
  },
  supportPlans: {
    title: "Keep your product running smoothly",
    subtitle: "Choose a support plan when you sign off your handover. You can change it later.",
    plans: [
      { id: "none", name: "No plan", price: 0, currency: "NGN", period: "", description: "Pay per fix when you need help.", features: ["Bug fixes quoted individually"] },
      { id: "basic", name: "Basic care", price: 75000, currency: "NGN", period: "month", description: "Security updates and monitoring.", features: ["Security and library updates", "Uptime monitoring", "2 hours of fixes per month"] },
      { id: "growth", name: "Growth", price: 180000, currency: "NGN", period: "month", description: "For products that keep improving.", features: ["Everything in Basic care", "8 hours of changes per month", "Priority response within 1 working day"] },
    ] as SupportPlan[],
  },
  ideaForm: {
    intro: "No technical knowledge needed. Takes about 3 minutes.",
    responseTime: "2 working days",
    categories: ["Marketplace", "E-commerce", "Fintech", "Health", "Education", "Logistics", "Agriculture", "Social / Community", "dApps (Web3)", "Other"],
    platforms: ["Website", "Android app", "iPhone app", "Admin dashboard", "dApp (Web3)"],
    budgets: ["Under ₦1M", "₦1M – ₦3M", "₦3M – ₦7M", "₦7M – ₦15M", "Above ₦15M", "Not sure yet"],
    timelines: ["As soon as possible", "1 – 3 months", "3 – 6 months", "6+ months", "Flexible"],
  },
  payments: {
    feeTitle: "Fund your project wallet",
    feeExplainer: "A one-off ₦2,000 commitment fee shows you're serious and lets our engineers review your idea. If we can't take your idea on, we refund it in full.",
    transferInstructions: "Use your idea reference as the transfer narration so we can match your payment quickly.",
    confirmationTime: "1 working day",
  },
  footer: {
    ctaEyebrow: "Got an idea?",
    ctaTitle: "You bring the idea. We'll build it with you.",
    ctaText: "No technical skills needed. Tell us the problem, your users and your budget, and our engineers will send a proposal.",
    ctaButton: "Get started",
    about: "We build your idea. You watch it grow. Then you learn the stack behind it. An Aptech initiative.",
    email: "hello@aiprojectconnect.com",
    phone: "+234 700 APTECH (278324)",
    address: "Visit any Aptech centre to submit an idea in person",
    columns: [
      {
        title: "Product",
        links: [
          { label: "Track a project", href: "#track" },
          { label: "Submit an idea", href: SUBMIT_IDEA_HREF },
          { label: "Courses", href: "#courses" },
          { label: "Support plans", href: "#contact" },
        ],
      },
      {
        title: "Learn the stack",
        links: [
          { label: "React & Next.js", href: "#courses" },
          { label: "Node.js back-end", href: "#courses" },
          { label: "Flutter mobile apps", href: "#courses" },
          { label: "All Aptech courses", href: "#courses" },
        ],
      },
      {
        title: "Company",
        links: [
          { label: "About Aptech", href: "#contact" },
          { label: "Our centres", href: "#contact" },
          { label: "Privacy & NDAs", href: "#contact" },
          { label: "Terms", href: "#contact" },
        ],
      },
    ] as { title: string; links: LinkItem[] }[],
    wordmark: "Project Connect",
    copyright: "AI Project Connect by Aptech. All rights reserved.",
    securityNote: "Your ideas are confidential. Access always needs a one-time code.",
  },
};

export type SiteContent = typeof DEFAULT_CONTENT;

const CONTENT_KEY = "/content";

/** Last content loaded from the server, so non-React code can read it synchronously. */
let snapshot: SiteContent = DEFAULT_CONTENT;

/** Server content merged over the defaults, so a new field works before it is saved. */
function merge(saved: Partial<SiteContent> | undefined): SiteContent {
  if (!saved) return DEFAULT_CONTENT;
  const out = { ...DEFAULT_CONTENT } as Record<string, unknown>;
  for (const [key, value] of Object.entries(saved)) {
    const fallback = (DEFAULT_CONTENT as Record<string, unknown>)[key];
    out[key] = fallback && value && typeof fallback === "object" && !Array.isArray(fallback) ? { ...(fallback as object), ...(value as object) } : value;
  }
  snapshot = out as SiteContent;
  return snapshot;
}

export function useSiteContent(): SiteContent {
  const { data } = useApi<Partial<SiteContent>>(CONTENT_KEY);
  return useMemo(() => merge(data), [data]);
}

/** The same content with its loading and error state, for the editor. */
export function useSiteContentState() {
  const { data, loading, error, refresh } = useApi<Partial<SiteContent>>(CONTENT_KEY);
  return { content: useMemo(() => merge(data), [data]), loaded: data !== undefined, loading, error, refresh };
}

/** Only current once the content has loaded at least once; components should use useSiteContent. */
export const readSiteContent = () => snapshot;

export async function publishSiteContent(next: SiteContent) {
  await api.put("/admin/content", next);
  snapshot = next;
  await invalidate(CONTENT_KEY);
}

export async function resetSiteContent() {
  await api.post("/admin/content/reset");
  await invalidate(CONTENT_KEY);
}
/** Plain-language stage meaning as edited by admins. */
export function stageMeaning(stage: StageKey) {
  return readSiteContent().portal.stageMeanings?.[stage] || STAGES[stage].meaning;
}
