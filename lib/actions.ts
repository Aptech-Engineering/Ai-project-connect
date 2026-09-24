"use client";

/**
 * Everything the two sides *do* to a project.
 *
 * The Engineering Panel posts updates, moves stages, tags the stack, keeps
 * milestones and the team, shares files and replies. The Client Portal asks
 * questions, approves milestones, asks about courses, rates the work and
 * uploads files. Both talk to the PHP API in backend/.
 *
 * Every function is async and returns whatever the server sent back. The server
 * writes the activity log and queues the email/SMS the PRD asks for (NT-01 to
 * NT-03), so nothing is recorded here — we only refresh the cached project
 * afterwards so both panels show the same thing.
 */
import { api, formData } from "./api";
import { refreshLeads, refreshProjects } from "./store";
import type { Person, Project, StageKey, Update } from "./types";

/** Rows come back with numeric ids; the shared types in lib/types.ts still call them strings. */
export type Id = string | number;

const staffProject = (code: string) => `/staff/projects/${encodeURIComponent(code)}`;
const clientProject = (code: string) => `/client/projects/${encodeURIComponent(code)}`;

/* ================= team → project (Engineering Panel) ================= */

export interface UpdateInput {
  title: string;
  body: string;
  visibility: "client" | "internal";
  demoLink?: string;
  /** One of the built-in preview pictures — not a file upload. */
  screenshot?: Update["screenshot"];
}

/**
 * Posts a progress update or an internal note (EN-03, EN-06).
 * An engineer's client-visible update comes back `pending` until a lead approves it.
 */
export async function postUpdate(code: string, input: UpdateInput) {
  const update = await api.post<Update>(`${staffProject(code)}/updates`, {
    title: input.title.trim(),
    body: input.body.trim(),
    visibility: input.visibility,
    demoLink: input.demoLink?.trim() || null,
    screenshot: input.screenshot ?? null,
  });
  await refreshProjects();
  return update;
}

/** Lead or admin publishes an update an engineer submitted. */
export async function approveUpdate(updateId: Id) {
  const update = await api.post<Update>(`/staff/updates/${updateId}/approve`);
  await refreshProjects();
  return update;
}

/** Rejects a pending update or removes a published one. Stage records are kept for the audit trail. */
export async function deleteUpdate(updateId: Id) {
  await api.del(`/staff/updates/${updateId}`);
  await refreshProjects();
}

/** Moves the stage and progress (EN-02). The server writes the client update and emails them. */
export async function changeStage(code: string, stage: StageKey, progress?: number, holdReason?: string) {
  const project = await api.put<Project>(`${staffProject(code)}/stage`, {
    stage,
    progress: progress ?? null,
    holdReason: holdReason?.trim() || null,
  });
  await refreshProjects();
  return project;
}

/** Edits the headline details: title, tagline, category, platforms, budget and dates. */
export async function editProjectDetails(
  code: string,
  patch: { title?: string; tagline?: string; category?: string; platforms?: string; budget?: string; startDate?: string; targetDate?: string },
) {
  const project = await api.patch<Project>(staffProject(code), patch);
  await refreshProjects();
  return project;
}

/* ---------- tech stack (EN-04) ---------- */

/** Tags a technology from the managed list, with a plain-language note on what it's for. */
export async function addTechnology(code: string, techId: string, usage: string) {
  const entry = await api.post<{ techId: string; usage: string }>(`${staffProject(code)}/technologies`, { techId, usage: usage.trim() });
  await refreshProjects();
  return entry;
}

export async function removeTechnology(code: string, techId: string) {
  await api.del(`${staffProject(code)}/technologies/${encodeURIComponent(techId)}`);
  await refreshProjects();
}

/* ---------- milestones (EN-05) ---------- */

/** `dueDate` is YYYY-MM-DD. */
export async function addMilestone(code: string, input: { title: string; dueDate: string; needsClientApproval?: boolean }) {
  const created = await api.post<{ id: number }>(`${staffProject(code)}/milestones`, {
    title: input.title.trim(),
    dueDate: input.dueDate,
    needsClientApproval: input.needsClientApproval ?? false,
  });
  await refreshProjects();
  return created;
}

export async function updateMilestone(milestoneId: Id, patch: { title?: string; dueDate?: string; completed?: boolean; needsClientApproval?: boolean }) {
  const saved = await api.patch<{ id: number }>(`/staff/milestones/${milestoneId}`, patch);
  await refreshProjects();
  return saved;
}

export async function deleteMilestone(milestoneId: Id) {
  await api.del(`/staff/milestones/${milestoneId}`);
  await refreshProjects();
}

/* ---------- team (AD-06) ---------- */

/** Assigns an active team member; the server emails them. */
export async function assignMember(code: string, userId: number) {
  const person = await api.post<Person>(`${staffProject(code)}/members`, { userId });
  await refreshProjects();
  return person;
}

/** The current lead can't be removed — change the lead first. */
export async function removeMember(code: string, userId: number) {
  await api.del(`${staffProject(code)}/members/${userId}`);
  await refreshProjects();
}

/** Admin only. The new lead is added to the team if they weren't already. */
export async function changeLead(code: string, userId: number) {
  const person = await api.put<Person>(`${staffProject(code)}/lead`, { userId });
  await refreshProjects();
  return person;
}

/* ---------- files (EN-08) ---------- */

/** Shares a document with the client. The server stores it outside the web root and emails them. */
export async function shareFile(code: string, file: File, kind: "proposal" | "design" | "doc" = "doc") {
  const shared = await api.post<{ id: number; name: string; size: string }>(`${staffProject(code)}/files`, formData({ file, kind }));
  await refreshProjects();
  return shared;
}

export async function removeFile(fileId: Id) {
  await api.del(`/staff/project-files/${fileId}`);
  await refreshProjects();
}

/* ---------- Project ID & messages (AD-08, NT-02) ---------- */

/**
 * Issues a new Project ID and revokes the old one (AD-08).
 * Every client session is signed out and the client is emailed the new ID.
 */
export async function regenerateProjectCode(code: string) {
  const result = await api.post<{ code: string; revoked: string }>(`${staffProject(code)}/regenerate-code`);
  await refreshProjects();
  return result;
}

export async function postTeamReply(code: string, text: string) {
  const sent = await api.post<{ id: number }>(`${staffProject(code)}/messages`, { text: text.trim() });
  await refreshProjects();
  return sent;
}

/* ================= client → project (Client Portal) ================= */

export async function postClientMessage(code: string, text: string) {
  const sent = await api.post<{ id: number }>(`${clientProject(code)}/messages`, { text: text.trim() });
  await refreshProjects();
  return sent;
}

/** Design sign-off and other approvals the team asked for (CL-08). */
export async function approveMilestoneAsClient(code: string, milestoneId: Id) {
  const result = await api.post<{ approvedAt: string }>(`${clientProject(code)}/milestones/${milestoneId}/approve`);
  await refreshProjects();
  return result;
}

/** "Learn this stack" → Request info / Enrol (LS-03). Creates a counsellor lead. */
export async function requestCourse(code: string, techId: string, type: "info" | "enrol") {
  const lead = await api.post<{ id: number }>(`${clientProject(code)}/course-requests`, { techId, type });
  await Promise.all([refreshProjects(), refreshLeads()]);
  return lead;
}

/** Turns course suggestions on or off. Opting out never affects status access. */
export async function setPromosOptOut(code: string, optOut: boolean) {
  const prefs = await api.patch<{ promosOptOut: boolean; digestOptOut: boolean }>(`${clientProject(code)}/preferences`, { promosOptOut: optOut });
  await refreshProjects();
  return prefs;
}

/** Rating and testimonial, once the project is delivered (CL-10). */
export async function rateProject(code: string, stars: number, text?: string) {
  const rating = await api.post<{ stars: number }>(`${clientProject(code)}/rating`, { stars, text: text?.trim() || null });
  await refreshProjects();
  return rating;
}

/** The client shares content, logos or documents with their team (CL-06). */
export async function clientUploadFile(code: string, file: File, note?: string) {
  const uploaded = await api.post<{ id: number; name: string; size: string }>(`${clientProject(code)}/files`, formData({ file, note: note?.trim() || undefined }));
  await refreshProjects();
  return uploaded;
}

/** The client invites a colleague to the course behind one of their technologies (LS-08). */
export async function inviteToCourse(code: string, input: { techId: string; name: string; email: string; message?: string }) {
  const invite = await api.post<{ id: number }>(`${clientProject(code)}/course-invites`, {
    techId: input.techId,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    message: input.message?.trim() || null,
  });
  await refreshLeads();
  return invite;
}

/* ================= public ================= */

/** Enquiry from the courses section of the website — no project and no sign-in. */
export async function requestCourseEnquiry(courseId: string, type: "info" | "enrol", name: string, email: string, phone: string) {
  const lead = await api.post<{ id: number }>("/course-enquiries", {
    courseId,
    type,
    name: name.trim(),
    email: email.trim(),
    phone: phone.trim(),
  });
  await refreshLeads();
  return lead;
}

export interface IdeaStatus {
  ref: string;
  title: string;
  status: "DRAFT" | "NEW" | "REVIEWING" | "QUOTE_SENT" | "ACCEPTED" | "DECLINED";
  submittedAt: string | null;
  /** True once the idea has become a project. The Project ID is never revealed here. */
  projectRegistered: boolean;
}

/** The Tracker: "where is my idea?" by reference, with no sign-in. Throws if the reference is unknown. */
export function lookupIdea(ref: string) {
  return api.get<IdeaStatus>(`/ideas/${encodeURIComponent(ref.trim().toUpperCase())}`);
}
