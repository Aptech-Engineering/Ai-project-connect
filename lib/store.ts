"use client";

/**
 * Server-backed data for both panels. Every hook is a cached GET; mutations live
 * in actions.ts / flows.ts and call `refreshProjects()` when they change something.
 */
import { api, query } from "./api";
import { clearCache, invalidate, useApi } from "./remote";
import type { Activity, CourseLead, Notice, Project, StageKey, Update } from "./types";

export const KEYS = {
  staffProjects: "/staff/projects",
  clientProjects: "/client/projects",
  clientMe: "/client/me",
  dashboard: "/staff/dashboard",
  approvals: "/staff/approvals",
  messages: "/staff/messages",
  notifications: "/staff/notifications",
  ideas: "/staff/ideas",
  payments: "/staff/payments",
  leads: "/staff/leads",
  changeRequests: "/staff/change-requests",
  activity: "/admin/activity",
  reports: "/admin/reports",
} as const;

/* ---------------- staff ---------------- */

export interface DashboardSummary {
  activeProjects: number;
  deliveredProjects: number;
  pendingApprovals: number;
  /** Projects where the client asked something and nobody has replied. */
  needsReply: number;
  avgDaysSinceClientUpdate: number;
  staleProjects: { code: string; title: string; daysSinceClientUpdate: number }[];
  newIdeas: number;
  newLeads: number;
  /** Scholarship transfers to confirm, plus paid applicants with no exam batch yet. */
  scholarshipTasks?: number;
  /** Admins only. */
  paymentsToConfirm?: number;
  refundsPending?: number;
}

/** One row of the projects list. The full project comes from `useStaffProject(code)`. */
export interface ProjectSummary {
  id: number;
  code: string;
  title: string;
  clientName: string;
  leadName: string | null;
  stage: StageKey;
  progress: number;
  targetDate: string;
  lastClientUpdateAt: string | null;
  daysSinceClientUpdate: number | null;
  stale: boolean;
  pendingUpdates: number;
  needsReply: boolean;
}

/** An update waiting for a lead to approve it, with the project it belongs to. */
export interface PendingUpdate extends Update {
  projectCode: string;
  projectTitle: string;
}

export interface MessageThread {
  projectCode: string;
  projectTitle: string;
  clientName: string;
  needsReply: boolean;
  messageCount: number;
  last?: { from: "client" | "team"; author: string; text: string; at: string };
}

export function useDashboard() {
  return useApi<DashboardSummary>(KEYS.dashboard);
}

export function useStaffProjects(filters: { stage?: string; q?: string } = {}) {
  const { data, loading, error, refresh } = useApi<ProjectSummary[]>(KEYS.staffProjects + query(filters));
  return { projects: data ?? [], loading, error, refresh };
}

export function useStaffProject(code: string | null) {
  return useApi<Project>(code ? `${KEYS.staffProjects}/${code}` : null);
}

/** Client-visible updates an engineer wrote that a lead still has to approve. */
export function useApprovals() {
  const { data, loading, error } = useApi<PendingUpdate[]>(KEYS.approvals);
  return { updates: data ?? [], loading, error };
}

export function useMessageThreads() {
  const { data, loading, error } = useApi<MessageThread[]>(KEYS.messages);
  return { threads: data ?? [], loading, error };
}

/** The notification outbox (admin). */
export function useNotifications(filters: { audience?: string; status?: string } = {}) {
  const { data, loading, error } = useApi<Notice[]>(KEYS.notifications + query(filters));
  return { notices: data ?? [], loading, error };
}

export interface ExistingClient {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  organisation?: string | null;
  country?: string | null;
  state?: string | null;
  projects: number;
}

/** Clients we already work with, for the walk-in form's "returning client" search. */
export function useStaffClients(q: string) {
  const search = q.trim();
  const { data, loading } = useApi<ExistingClient[]>(search.length >= 2 ? "/staff/clients" + query({ q: search }) : null);
  return { clients: data ?? [], loading };
}

export interface LeadStats {
  total?: number;
  enrolled?: number;
  contacted?: number;
  [key: string]: number | undefined;
}

export function useLeads(status?: string) {
  const { data, loading, error } = useApi<{ leads: CourseLead[]; stats?: LeadStats }>(KEYS.leads + query({ status }));
  return { leads: data?.leads ?? [], stats: data?.stats, loading, error };
}

/** Counsellors move a course lead along: NEW → CONTACTED → ENROLLED / CLOSED. */
export async function updateLead(id: number, patch: { status?: CourseLead["status"]; notes?: string | null }) {
  const lead = await api.patch<CourseLead>(`${KEYS.leads}/${id}`, patch);
  await refreshLeads();
  return lead;
}

/** Admins can remove a lead entirely, along with the follow-ups sent on it. */
export async function deleteLead(id: number) {
  await api.del(`${KEYS.leads}/${id}`);
  await refreshLeads();
}

/**
 * Deletes a project and everything attached to it — updates, files, messages, the idea
 * it came from and that idea's payments. `confirm` must be the project code.
 */
export async function deleteProject(code: string, confirm: string) {
  await api.del(`/admin/projects/${encodeURIComponent(code)}`, { confirm });
  await invalidate(KEYS.staffProjects, KEYS.dashboard, KEYS.ideas, KEYS.payments, KEYS.activity, KEYS.reports);
}

/**
 * Emails the person behind a course lead. The message is kept with the lead, and a
 * lead that was still NEW becomes CONTACTED.
 */
export async function sendLeadMessage(id: number, subject: string, body: string) {
  const lead = await api.post<CourseLead>(`${KEYS.leads}/${id}/messages`, { subject, body });
  await refreshLeads();
  return lead;
}

export interface ActivityFilters {
  q?: string;
  page?: number;
  actorType?: "staff" | "client" | "system";
  projectCode?: string;
  /** YYYY-MM-DD */
  from?: string;
  to?: string;
}

/** The audit trail, 50 entries a page. `activityCsvPath` downloads the same rows. */
export function useActivity(filters: ActivityFilters = {}) {
  const { data, loading, error, refresh } = useApi<{ items: Activity[]; page: number; pages: number; total: number }>(KEYS.activity + query(filters));
  return { items: data?.items ?? [], page: data?.page ?? 1, pages: data?.pages ?? 1, total: data?.total ?? 0, loading, error, refresh };
}

export const activityCsvPath = (filters: ActivityFilters = {}) => `${KEYS.activity}.csv${query(filters)}`;

export function useReports(days = 90) {
  return useApi<Record<string, unknown>>(KEYS.reports + query({ days }));
}

/* ---------------- client portal ---------------- */

export interface ClientSession {
  client: { name: string; short: string };
  projects: { code: string; title: string; stage: string; progress: number }[];
}

/** The signed-in client and their projects, or undefined when signed out. */
export function useClientSession() {
  const { data, loading, error, refresh } = useApi<ClientSession>(KEYS.clientMe);
  return { session: data, loading, error, refresh };
}

export function useClientProject(code: string | null) {
  return useApi<Project>(code ? `${KEYS.clientProjects}/${code}` : null);
}

export async function requestClientCode(projectCode: string) {
  return api.post<{ sentTo?: { email?: string; phone?: string }; expiresInMinutes?: number; resendInSeconds?: number; devCode?: string }>("/client/auth/request-code", { projectCode });
}

export async function verifyClientCode(projectCode: string, code: string) {
  const res = await api.post<{ project?: Project; code?: string }>("/client/auth/verify", { projectCode, code });
  clearCache();
  return res;
}

export async function clientSignOut() {
  try {
    await api.post("/client/auth/logout");
  } finally {
    clearCache();
  }
}

/* ---------------- refreshing ---------------- */

/** Reloads anything that shows a project after a change. */
export function refreshProjects() {
  return invalidate(KEYS.staffProjects, KEYS.clientProjects, KEYS.clientMe, KEYS.dashboard, KEYS.approvals, KEYS.messages, KEYS.activity, KEYS.reports);
}

/** Reloads the idea inbox, payments and everything derived from them. */
export function refreshIdeas() {
  return invalidate(KEYS.ideas, KEYS.payments, KEYS.dashboard, KEYS.activity, KEYS.reports);
}

export function refreshLeads() {
  return invalidate(KEYS.leads, KEYS.dashboard, KEYS.reports);
}

export function refreshNotifications() {
  return invalidate(KEYS.notifications, KEYS.dashboard);
}

/** Records a course view/click so the funnel report can count it. Invites are counted server-side. */
export function trackCourseEvent(event: "view" | "click", courseId: string, techId?: string, projectCode?: string) {
  return api.post("/course-events", { event, courseId, techId, projectCode }).catch(() => {});
}
