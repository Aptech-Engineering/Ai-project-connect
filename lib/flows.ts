"use client";

/**
 * Quotes, walk-in registration, client uploads, change requests, handover,
 * course invites, weekly digests and reports. Mirrors the PHP API in backend/.
 */
import { STAGES, clientUpdates } from "./data";
import { findCourse, findTechnology, formatPrice, readCourses } from "./catalog";
import { readSiteContent, stageMeaning } from "./content";
import { findIdea, readIdeas, updateIdea, type Idea, type Quote } from "./ideas";
import type { StoredFileMeta } from "./files";
import {
  addLead,
  logActivity,
  notifyClient,
  notifyStaff,
  readProjects,
  recordCourseEvent,
  sendNotice,
  uid,
  updateProject,
  withActivity,
} from "./store";
import { convertIdeaToProject } from "./actions";
import { paymentBlocker } from "./wallet";
import { daysFromNow } from "./format";
import type { ChangeRequest, ChangeRequestStatus, HandoverItem, Person, Project, SharedFile } from "./types";

const staffEmail = (p: Person) => `${p.name} · ${p.name.split(" ")[0].toLowerCase()}@aptech.dev`;
const clientActor = (p: Project) => `${p.client.name} (Client)`;
const money = (amount: number, currency: string) => formatPrice(amount, currency);
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

/* ================= 1. Quotes ================= */

export function quoteLink(idea: Idea) {
  return idea.quote ? `/quote?ref=${encodeURIComponent(idea.ref)}&token=${encodeURIComponent(idea.quote.token)}` : null;
}

export function sendQuote(
  idea: Idea,
  input: { amount: number; currency: string; summary: string; timelineWeeks?: number; validUntil: string; leadName: string; targetDate: string; proposal?: StoredFileMeta },
  actor: Person,
): Quote {
  const blocked = paymentBlocker(idea);
  if (blocked) throw new Error(blocked);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
  const quote: Quote = { ...input, id: uid(), token, status: "sent", sentAt: new Date().toISOString(), sentBy: actor.name };
  updateIdea(idea.id, { quote, status: "QUOTE_SENT" });
  const link = `/quote?ref=${idea.ref}&token=${token}`;
  sendNotice({
    audience: "client",
    channel: "email",
    to: `${idea.name} · ${idea.email}`,
    subject: `Your proposal for ${idea.title}`,
    body: `Hi ${idea.name},\n\nYour proposal for ${idea.title} is ready: ${money(input.amount, input.currency)}${input.timelineWeeks ? ` over about ${input.timelineWeeks} weeks` : ""}.\n\nReview and accept online: ${link}\n\nValid until ${new Date(input.validUntil).toDateString()}.`,
  });
  logActivity(actor, `Sent a quote for idea ${idea.ref} (${money(input.amount, input.currency)})`);
  return quote;
}

export function withdrawQuote(idea: Idea, actor: Person) {
  if (!idea.quote || idea.quote.status !== "sent") return;
  updateIdea(idea.id, { quote: { ...idea.quote, status: "withdrawn" }, status: "REVIEWING" });
  logActivity(actor, `Withdrew the quote for idea ${idea.ref}`);
}

export type QuoteLookup =
  | { ok: true; idea: Idea; quote: Quote; expired: boolean }
  | { ok: false; error: string };

export function openQuote(ref: string, token: string): QuoteLookup {
  const idea = findIdea(ref);
  if (!idea?.quote || idea.quote.token !== token) return { ok: false, error: "This quote link is invalid or has been replaced by a newer quote." };
  return { ok: true, idea, quote: idea.quote, expired: idea.quote.status === "sent" && idea.quote.validUntil < dateOnly(new Date()) };
}

/** Client accepts online → the project is registered automatically. Returns the new Project ID. */
export function acceptQuote(ref: string, token: string, name: string): { ok: true; code: string; sentTo: string } | { ok: false; error: string } {
  const found = openQuote(ref, token);
  if (!found.ok) return found;
  const { idea, quote } = found;
  if (quote.status === "accepted") return { ok: false, error: "This quote has already been accepted. Check your email for your Project ID." };
  if (quote.status !== "sent") return { ok: false, error: "This quote is no longer open. Please contact us for an updated proposal." };
  if (found.expired) return { ok: false, error: "This quote has expired. Please contact us for an updated proposal." };
  if (paymentBlocker(idea)) return { ok: false, error: "We're still confirming your commitment fee. You can accept once it's confirmed." };

  const lead: Person = { name: quote.leadName, role: "Project lead" };
  const code = convertIdeaToProject(idea, lead, quote.targetDate, { name: "System", role: "online quote acceptance" });
  updateIdea(idea.id, { quote: { ...quote, status: "accepted", acceptedName: name, respondedAt: new Date().toISOString() } });
  logActivity("System", `Quote accepted online by ${name} (idea ${idea.ref})`, code);
  notifyStaff("Admin team · admin@aptech.dev", `Quote accepted: ${idea.title}`, `${name} accepted the ${money(quote.amount, quote.currency)} quote online. Project ${code} is registered and ${lead.name} is the lead.`, code);
  return { ok: true, code, sentTo: `${idea.email[0]}•••@${idea.email.split("@")[1]}` };
}

export function declineQuote(ref: string, token: string, reason?: string): { ok: true } | { ok: false; error: string } {
  const found = openQuote(ref, token);
  if (!found.ok) return found;
  if (found.quote.status !== "sent" || found.expired) return { ok: false, error: "This quote is no longer open." };
  updateIdea(found.idea.id, { quote: { ...found.quote, status: "declined", clientNote: reason, respondedAt: new Date().toISOString() }, status: "REVIEWING" });
  logActivity("System", `Quote for idea ${found.idea.ref} declined by the client${reason ? `: ${reason}` : ""}`);
  notifyStaff(`${found.quote.sentBy} · team`, `Quote declined: ${found.idea.title}`, `${reason || "No reason given."}\n\nThe idea is back in review so you can send a revised quote.`);
  return { ok: true };
}

/* ================= 2. Walk-in clients (see lib/wallet.ts startWalkInApplication) ================= */

/** Distinct clients across projects, for the "existing client" picker. */
export function existingClients() {
  const map = new Map<string, { name: string; email?: string; phone?: string; organisation?: string; projects: number; sample: Project }>();
  for (const p of readProjects()) {
    const key = (p.client.email ?? p.client.name).toLowerCase();
    const found = map.get(key);
    if (found) found.projects++;
    else map.set(key, { name: p.client.name, email: p.client.email, phone: p.client.phone, organisation: p.client.organisation, projects: 1, sample: p });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/* ================= 3. Client uploads ================= */

export function clientUploadFile(p: Project, file: Omit<SharedFile, "id" | "date" | "source" | "uploadedBy">) {
  updateProject(p.code, (proj) =>
    withActivity({ ...proj, files: [{ ...file, id: uid(), date: new Date().toISOString(), uploadedBy: proj.client.name, source: "client" }, ...proj.files] }, clientActor(proj), `Uploaded ${file.name}`),
  );
  notifyStaff(staffEmail(p.lead), `${p.client.name} uploaded a file · ${p.title}`, `${file.name} (${file.size})${file.note ? `\n\n${file.note}` : ""}`, p.code);
}

/* ================= 5. Change requests ================= */

export const CHANGE_STATUS: Record<ChangeRequestStatus, { label: string; className: string }> = {
  SUBMITTED: { label: "Submitted", className: "bg-brand text-white" },
  REVIEWING: { label: "Being reviewed", className: "bg-blue-soft text-navy" },
  QUOTED: { label: "Needs decision", className: "bg-brand-soft text-brand-700" },
  APPROVED: { label: "Approved", className: "bg-teal-soft text-teal-700" },
  DECLINED: { label: "Declined", className: "bg-line text-muted" },
  COMPLETED: { label: "Completed", className: "bg-teal text-white" },
};

export function impactText(cr: ChangeRequest) {
  const parts: string[] = [];
  if (cr.impactCost != null) parts.push(`${money(cr.impactCost, cr.currency)} extra`);
  if (cr.impactDays != null) parts.push(cr.impactDays === 0 ? "no change to the delivery date" : cr.impactDays > 0 ? `${cr.impactDays} more days` : `${-cr.impactDays} days sooner`);
  return parts.join(" · ") || "No extra cost or time";
}

function patchChange(p: Project, id: string, patch: Partial<ChangeRequest>, actor: Person | string, action: string, extra?: (proj: Project) => Project) {
  updateProject(p.code, (proj) => {
    let next: Project = { ...proj, changeRequests: (proj.changeRequests ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)) };
    if (extra) next = extra(next);
    return withActivity(next, actor, action);
  });
}

export function clientRequestChange(p: Project, title: string, description: string) {
  const cr: ChangeRequest = { id: uid(), title, description, requestedBy: "client", requesterName: p.client.name, status: "SUBMITTED", currency: "NGN", createdAt: new Date().toISOString() };
  updateProject(p.code, (proj) => withActivity({ ...proj, changeRequests: [cr, ...(proj.changeRequests ?? [])] }, clientActor(proj), `Requested a change: "${title}"`));
  notifyStaff(staffEmail(p.lead), `Change request on ${p.title}: ${title}`, `${description}\n\nReview it and share the cost and time impact in the Engineering Panel.`, p.code);
}

export function staffRaiseChange(p: Project, title: string, description: string, actor: Person) {
  const cr: ChangeRequest = { id: uid(), title, description, requestedBy: "team", requesterName: actor.name, status: "REVIEWING", currency: "NGN", createdAt: new Date().toISOString() };
  updateProject(p.code, (proj) => withActivity({ ...proj, changeRequests: [cr, ...(proj.changeRequests ?? [])] }, actor, `Raised change request "${title}"`));
}

export function clientRespondChange(p: Project, cr: ChangeRequest, decision: "approve" | "decline", note?: string) {
  if (cr.status !== "QUOTED") return;
  const now = new Date().toISOString();
  const status = decision === "approve" ? "APPROVED" : "DECLINED";
  const responseNote = [cr.responseNote, note ? `Client: ${note}` : ""].filter(Boolean).join("\n\n") || undefined;
  patchChange(p, cr.id, { status, decidedAt: now, responseNote }, clientActor(p), `${decision === "approve" ? "Approved" : "Declined"} change request "${cr.title}"`, (proj) => {
    if (decision !== "approve" || !cr.impactDays || cr.impactDays <= 0) return proj;
    const target = new Date(proj.targetDate);
    target.setDate(target.getDate() + cr.impactDays);
    return withActivity({ ...proj, targetDate: target.toISOString() }, clientActor(proj), `Target delivery moved by ${cr.impactDays} days (change request "${cr.title}")`);
  });
  notifyStaff(staffEmail(p.lead), `Change request ${decision === "approve" ? "approved" : "declined"}: ${cr.title}`, `${p.client.name} ${decision === "approve" ? "approved" : "declined"} the change on ${p.title}.${note ? `\n\nNote: ${note}` : ""}`, p.code);
}

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

export function staffUpdateChange(
  p: Project,
  cr: ChangeRequest,
  input: { status: ChangeRequestStatus; impactCost?: number; impactDays?: number; currency?: string; responseNote?: string },
  actor: Person,
): string | null {
  if (!CHANGE_FLOW[cr.status].includes(input.status)) return `Can't move a ${cr.status.toLowerCase()} request to ${input.status.toLowerCase()}.`;
  if (input.status === "QUOTED" && input.impactCost == null && input.impactDays == null) return "Add the extra cost, extra days, or both before sending to the client.";
  const patch: Partial<ChangeRequest> = { status: input.status, impactCost: input.impactCost, impactDays: input.impactDays, currency: input.currency ?? cr.currency, responseNote: input.responseNote };
  if (input.status === "DECLINED" || input.status === "COMPLETED") patch.decidedAt = cr.decidedAt ?? new Date().toISOString();
  patchChange(p, cr.id, patch, actor, `Marked change request "${cr.title}" as ${input.status.toLowerCase()}`);
  const updated = { ...cr, ...patch };
  if (input.status === "QUOTED") notifyClient(p, `Your change request needs a decision: ${cr.title}`, `Impact: ${impactText(updated)}${input.responseNote ? `\n\n${input.responseNote}` : ""}\n\nSign in with your Project ID to approve or decline.`);
  if (input.status === "DECLINED") notifyClient(p, `Update on your change request: ${cr.title}`, input.responseNote || "We're not able to include this change right now.", "email");
  if (input.status === "COMPLETED") notifyClient(p, `Change completed: ${cr.title}`, `The change "${cr.title}" is now part of ${p.title}.`, "email");
  return null;
}

/* ================= 6. Handover ================= */

export const DEFAULT_HANDOVER_ITEMS = [
  "Source code and repository access handed over",
  "Admin logins and passwords shared securely",
  "Hosting, domain and app store accounts transferred",
  "User guide and documentation delivered",
  "Training session with your team completed",
];

function patchHandover(p: Project, fn: (items: HandoverItem[], h: NonNullable<Project["handover"]>) => Partial<NonNullable<Project["handover"]>>, actor: Person | string, action: string) {
  updateProject(p.code, (proj) => {
    const handover = proj.handover ?? { items: [] };
    return withActivity({ ...proj, handover: { ...handover, ...fn(handover.items, handover) } }, actor, action);
  });
}

export function addHandoverItems(p: Project, titles: string[], actor: Person) {
  const existing = new Set((p.handover?.items ?? []).map((i) => i.title));
  const fresh = titles.filter((t) => !existing.has(t)).map((title) => ({ id: uid(), title }));
  if (!fresh.length) return 0;
  patchHandover(p, (items) => ({ items: [...items, ...fresh] }), actor, `Added ${fresh.length} handover checklist item${fresh.length === 1 ? "" : "s"}`);
  return fresh.length;
}

export function toggleHandoverItem(p: Project, itemId: string, done: boolean, actor: Person) {
  const item = p.handover?.items.find((i) => i.id === itemId);
  patchHandover(p, (items) => ({ items: items.map((i) => (i.id === itemId ? { ...i, doneAt: done ? i.doneAt ?? new Date().toISOString() : undefined, doneBy: done ? actor.name : undefined } : i)) }), actor, `${done ? "Completed" : "Reopened"} handover item "${item?.title}"`);
}

export function removeHandoverItem(p: Project, itemId: string, actor: Person) {
  const item = p.handover?.items.find((i) => i.id === itemId);
  patchHandover(p, (items) => ({ items: items.filter((i) => i.id !== itemId) }), actor, `Removed handover item "${item?.title}"`);
}

export function handoverBlocker(p: Project): string | null {
  if (p.handover?.signedAt) return "The handover has already been signed.";
  if (p.stage !== "DEPLOYMENT" && p.stage !== "DELIVERED") return "Move the project to Deployment first.";
  const items = p.handover?.items ?? [];
  if (!items.length) return "Add the handover checklist first.";
  if (items.some((i) => !i.doneAt)) return "Complete every checklist item first.";
  return null;
}

export function requestHandoverSignOff(p: Project, actor: Person) {
  patchHandover(p, () => ({ requestedAt: new Date().toISOString() }), actor, "Requested handover sign-off from the client");
  notifyClient(p, `Your product is ready for handover: ${p.title}`, "Everything on the handover checklist is done. Sign in with your Project ID to review it, choose a support plan and sign off.");
}

export function clientSignHandover(p: Project, name: string, planId: string) {
  const plan = readSiteContent().supportPlans.plans.find((pl) => pl.id === planId);
  const now = new Date().toISOString();
  updateProject(p.code, (proj) => {
    let next: Project = withActivity(
      { ...proj, handover: { ...(proj.handover ?? { items: [] }), signedAt: now, signedName: name, supportPlan: planId } },
      clientActor(proj),
      `Signed off the handover as ${name} and chose the ${plan?.name ?? planId} support plan`,
    );
    if (proj.stage !== "DELIVERED") {
      next = withActivity(
        {
          ...next,
          stage: "DELIVERED",
          progress: 100,
          holdReason: undefined,
          deliveredDate: now,
          updates: [{ id: uid(), date: now, kind: "stage", author: proj.lead, title: "Your product is delivered!", body: stageMeaning("DELIVERED") }, ...next.updates],
        },
        "System",
        `Changed stage from ${STAGES[proj.stage].label} to Delivered (handover signed by ${name})`,
      );
    }
    return next;
  });
  notifyClient(p, `${p.title} is delivered`, stageMeaning("DELIVERED"));
  notifyStaff(staffEmail(p.lead), `Handover signed: ${p.title}`, `${name} signed off the handover and chose the ${plan?.name ?? planId} support plan. The project is now delivered.`, p.code);
}

/* ================= 7. Course invites & funnel ================= */

export function trackCourseClick(courseId: string, techId?: string, projectCode?: string) {
  recordCourseEvent("click", courseId, techId, projectCode);
}

const viewedThisSession = new Set<string>();
export function trackCourseView(courseId: string) {
  if (viewedThisSession.has(courseId)) return;
  viewedThisSession.add(courseId);
  recordCourseEvent("view", courseId);
}

export function inviteToCourse(p: Project, techId: string, name: string, email: string, message?: string): string | null {
  const tech = findTechnology(techId);
  const course = tech ? findCourse(tech.courseId) : undefined;
  if (!tech || !course?.published || !p.stack.some((s) => s.techId === techId)) return "No course is available for that technology.";
  addLead({ projectCode: p.code, projectTitle: p.title, clientName: name, contact: email.toLowerCase(), techId, courseId: course.id, type: "info", source: "invite", invitedBy: p.client.name, notes: message });
  recordCourseEvent("invite", course.id, techId, p.code);
  sendNotice({
    audience: "client",
    channel: "email",
    to: `${name} · ${email}`,
    subject: `${p.client.name} invited you to learn ${tech.name}`,
    body: `Hi ${name},\n\n${p.client.name} is building ${p.title} with Aptech and thinks you'd enjoy learning ${tech.name}.${message ? `\n\n"${message}"` : ""}\n\nCourse: ${course.title} · ${course.duration} · ${formatPrice(course.price, course.currency)}${course.discountPercent ? ` · ${course.discountPercent}% off with ${course.discountCode}` : ""}.`,
    projectCode: p.code,
  });
  sendNotice({ audience: "counsellor", channel: "email", to: "Admissions team · admissions@aptech.dev", subject: `Course invite: ${course.title}`, body: `${p.client.name} (${p.title}) invited ${name} <${email}> to ${course.title}.`, projectCode: p.code });
  logActivity(clientActor(p), `Invited ${name} to the ${tech.name} course`, p.code);
  return null;
}

/* ================= 8. Weekly digest ================= */

export function buildDigest(p: Project): { subject: string; body: string } | null {
  if (p.stage === "DELIVERED") return null;
  const weekAgo = Date.now() - 7 * 86400_000;
  const recent = clientUpdates(p).filter((u) => new Date(u.date).getTime() >= weekAgo);
  const upcoming = p.milestones.filter((m) => !m.completedAt && daysFromNow(m.due) <= 14).slice(0, 5);
  const decisions = (p.changeRequests ?? []).filter((c) => c.status === "QUOTED");
  const stage = STAGES[p.stage].label;
  const lines = [
    `Hi ${p.client.name},`,
    "",
    `Here's your weekly update on ${p.title}.`,
    "",
    `Stage: ${stage} · ${p.progress}% complete`,
    p.stage === "ON_HOLD" && p.holdReason ? `Paused: ${p.holdReason}` : stageMeaning(p.stage),
    `Target delivery: ${new Date(p.targetDate).toDateString()}`,
    "",
    recent.length ? "This week:" : "No new updates this week — your team is heads-down building.",
    ...recent.map((u) => `• ${new Date(u.date).toDateString()} — ${u.title}`),
    ...(upcoming.length ? ["", "Coming up:", ...upcoming.map((m) => `• ${m.title} — due ${new Date(m.due).toDateString()}${m.needsClientApproval ? " (needs your approval)" : ""}`)] : []),
    ...(decisions.length ? ["", `Waiting for your decision: ${decisions.map((d) => d.title).join(", ")}`] : []),
    "",
    `Sign in with your Project ID ${p.code} to see everything. You can turn off these weekly emails in your portal.`,
  ];
  return { subject: `Your weekly update: ${p.title} is ${stage.toLowerCase()} (${p.progress}%)`, body: lines.join("\n") };
}

export function sendWeeklyDigests(actor: Person) {
  let sent = 0;
  let skipped = 0;
  for (const p of readProjects()) {
    const digest = buildDigest(p);
    if (!digest || p.digestOptOut) {
      skipped++;
      continue;
    }
    notifyClient(p, digest.subject, digest.body, "email");
    sent++;
  }
  logActivity(actor, `Sent weekly progress emails (${sent} sent, ${skipped} skipped)`);
  return { sent, skipped };
}

export function setDigestOptOut(p: Project, optOut: boolean) {
  updateProject(p.code, (proj) => withActivity({ ...proj, digestOptOut: optOut }, clientActor(proj), optOut ? "Turned off weekly progress emails" : "Turned on weekly progress emails"));
}

/* ================= helpers for reports ================= */

export function overdueInfo(p: Project) {
  const days = -daysFromNow(p.targetDate);
  return p.stage !== "DELIVERED" && days > 0 ? days : 0;
}

export function courseTitle(id: string) {
  return readCourses().find((c) => c.id === id)?.title ?? id;
}

export { readIdeas };
