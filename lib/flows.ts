"use client";

/**
 * The longer journeys: quotes, scope changes, delivery handover, weekly
 * progress emails and the course funnel. Mirrors the PHP API in backend/.
 *
 * The server owns the rules — it decides whether a quote is still open, whether
 * a change request may move to the next status, and whether a handover can be
 * signed. The helpers here are only for showing the same thing on screen before
 * the person presses the button.
 */
import { api, formData, query } from "./api";
import { formatPrice } from "./catalog";
import { STALE_DAYS, clientUpdates } from "./data";
import { daysFromNow } from "./format";
import { invalidate } from "./remote";
import { KEYS, refreshIdeas, refreshProjects, trackCourseEvent } from "./store";
import type { Id } from "./actions";
import type { ChangeRequest, ChangeRequestStatus, Project } from "./types";

const money = (amount: number, currency: string) => formatPrice(amount, currency);
const staffProject = (code: string) => `/staff/projects/${encodeURIComponent(code)}`;
const clientProject = (code: string) => `/client/projects/${encodeURIComponent(code)}`;

/** Change requests show up in the project and in the staff queue. */
const refreshChanges = () => Promise.all([refreshProjects(), invalidate(KEYS.changeRequests)]);

/* ================= 1. Quotes ================= */

export interface QuoteProposal {
  name: string;
  size: string;
  /** Ready to open: the private link for clients, the staff file route for the team. */
  url: string;
}

/** A proposal sent to someone who submitted an idea. */
export interface Quote {
  id: number;
  amount: number;
  currency: string;
  summary: string;
  timelineWeeks: number | null;
  /** YYYY-MM-DD */
  validUntil: string;
  expired: boolean;
  status: "sent" | "accepted" | "declined" | "withdrawn";
  leadName: string | null;
  /** YYYY-MM-DD */
  targetDate: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  acceptedName: string | null;
  clientNote: string | null;
  proposal: QuoteProposal | null;
}

/** What the client sees on the private quote page. */
export interface QuoteView extends Quote {
  idea: { ref: string; title: string; name: string; emailMasked: string };
}

export interface QuoteInput {
  amount: number;
  currency: string;
  summary: string;
  timelineWeeks?: number;
  /** YYYY-MM-DD */
  validUntil: string;
  /** Staff id of the person who will lead the project if the quote is accepted. */
  leadId: number;
  /** YYYY-MM-DD */
  targetDate: string;
  /** Optional PDF proposal (10 MB or less). */
  proposal?: File;
}

/** The private page where a client reviews a quote. */
export function quoteLink(ref: string, token: string) {
  return `/quote?ref=${encodeURIComponent(ref)}&token=${encodeURIComponent(token)}`;
}

/**
 * Sends a proposal for a submitted idea and emails the client their private link.
 * The commitment fee must be confirmed first, or the server answers 409.
 * Outside production the response carries `devLink` so the link can be shown on screen.
 */
export async function sendQuote(ideaId: Id, input: QuoteInput) {
  const sent = await api.post<{ quote: Quote; devLink?: string }>(
    `/staff/ideas/${ideaId}/quote`,
    formData({
      amount: input.amount,
      currency: input.currency,
      summary: input.summary.trim(),
      timelineWeeks: input.timelineWeeks,
      validUntil: input.validUntil,
      leadId: input.leadId,
      targetDate: input.targetDate,
      proposal: input.proposal,
    }),
  );
  await refreshIdeas();
  return sent;
}

/** Closes an open quote and puts the idea back in review. */
export async function withdrawQuote(quoteId: Id) {
  await api.post(`/staff/quotes/${quoteId}/withdraw`);
  await refreshIdeas();
}

/** Opens a quote from its private link. Throws when the link is wrong or replaced. */
export function openQuote(ref: string, token: string) {
  return api.get<QuoteView>(`/quotes/${encodeURIComponent(ref)}${query({ token })}`);
}

/** Accepting registers the project automatically and emails the new Project ID. */
export async function acceptQuote(ref: string, token: string, name: string) {
  const result = await api.post<{ projectRegistered: boolean; sentTo: string }>(`/quotes/${encodeURIComponent(ref)}/accept`, {
    token,
    name: name.trim(),
    agree: true,
  });
  await refreshIdeas();
  return result;
}

/** Declining puts the idea back in review so the team can send a revised quote. */
export async function declineQuote(ref: string, token: string, reason?: string) {
  const result = await api.post<{ status: string }>(`/quotes/${encodeURIComponent(ref)}/decline`, { token, reason: reason?.trim() || null });
  await refreshIdeas();
  return result;
}

/* ================= 2. Change requests ================= */

export const CHANGE_STATUS: Record<ChangeRequestStatus, { label: string; className: string }> = {
  SUBMITTED: { label: "Submitted", className: "bg-brand text-white" },
  REVIEWING: { label: "Being reviewed", className: "bg-blue-soft text-navy" },
  QUOTED: { label: "Needs decision", className: "bg-brand-soft text-brand-700" },
  APPROVED: { label: "Approved", className: "bg-teal-soft text-teal-700" },
  DECLINED: { label: "Declined", className: "bg-line text-muted" },
  COMPLETED: { label: "Completed", className: "bg-teal text-white" },
};

/** "₦150,000 extra · 7 more days", in the same words the client gets by email. */
export function impactText(cr: ChangeRequest) {
  const parts: string[] = [];
  if (cr.impactCost != null) parts.push(`${money(cr.impactCost, cr.currency)} extra`);
  if (cr.impactDays != null) parts.push(cr.impactDays === 0 ? "no change to the delivery date" : cr.impactDays > 0 ? `${cr.impactDays} more days` : `${-cr.impactDays} days sooner`);
  return parts.join(" · ") || "No extra cost or time";
}

/** The same moves the server allows, so the panel only offers the ones that will work. */
const CHANGE_FLOW: Record<ChangeRequestStatus, ChangeRequestStatus[]> = {
  SUBMITTED: ["REVIEWING", "QUOTED", "DECLINED"],
  REVIEWING: ["QUOTED", "DECLINED"],
  QUOTED: ["REVIEWING", "DECLINED"],
  APPROVED: ["COMPLETED"],
  DECLINED: ["REVIEWING"],
  COMPLETED: [],
};

export function nextChangeStatuses(cr: ChangeRequest) {
  return CHANGE_FLOW[cr.status];
}

/** The client asks for something extra (PRD risk: scope creep). */
export async function clientRequestChange(code: string, title: string, description: string) {
  const cr = await api.post<ChangeRequest>(`${clientProject(code)}/change-requests`, { title: title.trim(), description: description.trim() });
  await refreshChanges();
  return cr;
}

/** The client approves or declines a quoted change. Approving moves the delivery date for them. */
export async function clientRespondChange(crId: Id, decision: "approve" | "decline", note?: string) {
  const cr = await api.post<ChangeRequest>(`/client/change-requests/${crId}/${decision}`, { note: note?.trim() || null });
  await refreshChanges();
  return cr;
}

/** The team raises a change themselves; it starts in review rather than submitted. */
export async function staffRaiseChange(code: string, title: string, description: string) {
  const cr = await api.post<ChangeRequest>(`${staffProject(code)}/change-requests`, { title: title.trim(), description: description.trim() });
  await refreshChanges();
  return cr;
}

/** Lead or admin moves a change on. Going to QUOTED needs a cost, extra days, or both. */
export async function staffUpdateChange(
  crId: Id,
  input: { status: ChangeRequestStatus; impactCost?: number; impactDays?: number; currency?: string; responseNote?: string },
) {
  const cr = await api.patch<ChangeRequest>(`/staff/change-requests/${crId}`, {
    status: input.status,
    impactCost: input.impactCost ?? null,
    impactDays: input.impactDays ?? null,
    currency: input.currency ?? null,
    responseNote: input.responseNote?.trim() || null,
  });
  await refreshChanges();
  return cr;
}

/* ================= 3. Handover ================= */

/** The standard checklist the server adds with "use the standard list". */
export const DEFAULT_HANDOVER_ITEMS = [
  "Source code and repository access handed over",
  "Admin logins and passwords shared securely",
  "Hosting, domain and app store accounts transferred",
  "User guide and documentation delivered",
  "Training session with your team completed",
];

/** Adds the whole standard checklist, skipping anything already on it. */
export async function addStandardHandoverItems(code: string) {
  const added = await api.post<{ added: number }>(`${staffProject(code)}/handover/items`, { useDefaults: true });
  await refreshProjects();
  return added.added;
}

export async function addHandoverItem(code: string, title: string) {
  const added = await api.post<{ added: number }>(`${staffProject(code)}/handover/items`, { title: title.trim() });
  await refreshProjects();
  return added.added;
}

export async function toggleHandoverItem(itemId: Id, done: boolean) {
  const item = await api.patch<{ id: number; done: boolean }>(`/staff/handover-items/${itemId}`, { done });
  await refreshProjects();
  return item;
}

export async function removeHandoverItem(itemId: Id) {
  await api.del(`/staff/handover-items/${itemId}`);
  await refreshProjects();
}

/** Why the "Request sign-off" button is disabled, or null when it's ready. Mirrors the server's checks. */
export function handoverBlocker(p: Project): string | null {
  if (p.handover?.signedAt) return "The handover has already been signed.";
  if (p.stage !== "DEPLOYMENT" && p.stage !== "DELIVERED") return "Move the project to Deployment first.";
  const items = p.handover?.items ?? [];
  if (!items.length) return "Add the handover checklist first.";
  if (items.some((i) => !i.doneAt)) return "Complete every checklist item first.";
  return null;
}

/** Tells the client everything is ready and asks them to sign. */
export async function requestHandoverSignOff(code: string) {
  const result = await api.post<{ requestedAt: string }>(`${staffProject(code)}/handover/request`);
  await refreshProjects();
  return result;
}

/** The client signs, picks a support plan, and the project becomes Delivered. */
export async function clientSignHandover(code: string, name: string, supportPlan: string) {
  const result = await api.post<{ signedAt: string; supportPlan: string; stage: string }>(`${clientProject(code)}/handover/sign`, {
    name: name.trim(),
    supportPlan,
    agree: true,
  });
  await refreshProjects();
  return result;
}

/* ================= 4. Weekly progress emails (NT-04) ================= */

export interface DigestPreview {
  subject: string | null;
  body: string | null;
  /** True when this client has turned the weekly email off. */
  optedOut?: boolean;
  /** Set instead of a digest when there's nothing to send, e.g. the project is delivered. */
  skipped?: string;
}

/** Shows exactly what the client would receive this week. */
export function previewDigest(code: string) {
  return api.get<DigestPreview>(`${staffProject(code)}/digest-preview`);
}

/** Admin sends this week's emails to every active project whose client hasn't opted out. */
export async function sendWeeklyDigests() {
  const result = await api.post<{ sent: number; skipped: number }>("/admin/digests/send");
  await refreshProjects();
  return result;
}

/** The client turns their weekly progress email on or off. */
export async function setDigestOptOut(code: string, optOut: boolean) {
  const prefs = await api.patch<{ promosOptOut: boolean; digestOptOut: boolean }>(`${clientProject(code)}/preferences`, { digestOptOut: optOut });
  await refreshProjects();
  return prefs;
}

/* ================= 5. Course funnel (LS-05) ================= */

export function trackCourseClick(courseId: string, techId?: string, projectCode?: string) {
  return trackCourseEvent("click", courseId, techId, projectCode);
}

const viewedThisSession = new Set<string>();

/** Counted once per course per visit, so the funnel isn't inflated by scrolling. */
export function trackCourseView(courseId: string) {
  if (viewedThisSession.has(courseId)) return Promise.resolve();
  viewedThisSession.add(courseId);
  return trackCourseEvent("view", courseId);
}

/* ================= 6. Helpers for the reports screen ================= */

/** Days past the target delivery date, or 0 when the project is on time or delivered. */
export function overdueInfo(p: Project) {
  const days = -daysFromNow(p.targetDate);
  return p.stage !== "DELIVERED" && days > 0 ? days : 0;
}

/**
 * How long the client has been waiting for news (RP-01). `days` is null when
 * they have never had a client-visible update.
 */
export function updateGap(p: Project) {
  const last = clientUpdates(p)[0];
  const days = last ? Math.floor((Date.now() - new Date(last.date).getTime()) / 86_400_000) : null;
  return { lastAt: last?.date, days, stale: p.stage !== "DELIVERED" && (days === null || days >= STALE_DAYS) };
}

/** Client uploads and course invites belong to the project, so they live in actions.ts. */
export { clientUploadFile, inviteToCourse } from "./actions";
