"use client";

/**
 * Actions that cross between the Client Portal and the Engineering Panel.
 * Each one updates shared data, logs activity and queues the email/SMS the
 * PRD says should go out (NT-01 to NT-03), so both sides always agree.
 */
import { COURSES, STAGES, TECHNOLOGIES } from "./data";
import { findIdea, newProjectCode, readIdeas, submitIdea, updateIdea, type Idea, type IdeaInput } from "./ideas";
import { addLead, addProject, findProject, notifyClient, notifyStaff, readProjects, sendNotice, uid, updateProject, withActivity } from "./store";
import type { Person, Project, SharedFile, StageKey, Update } from "./types";

const staffEmail = (p: Person) => `${p.name} · ${p.name.split(" ")[0].toLowerCase()}@aptech.dev`;

/* ---------- client → team ---------- */

export function postClientMessage(p: Project, text: string) {
  updateProject(p.code, (proj) =>
    withActivity(
      { ...proj, messages: [...(proj.messages ?? []), { id: uid(), at: new Date().toISOString(), from: "client", author: proj.client.name, text }] },
      `${proj.client.name} (Client)`,
      "Sent a message to the team",
    ),
  );
  notifyStaff(staffEmail(p.lead), `New question from ${p.client.name} · ${p.title}`, text, p.code);
}

export function approveMilestoneAsClient(p: Project, milestoneId: string) {
  const m = p.milestones.find((x) => x.id === milestoneId);
  if (!m) return;
  const now = new Date().toISOString();
  updateProject(p.code, (proj) =>
    withActivity(
      { ...proj, milestones: proj.milestones.map((x) => (x.id === milestoneId ? { ...x, clientApprovedAt: now, completedAt: x.completedAt ?? now } : x)) },
      `${proj.client.name} (Client)`,
      `Approved milestone "${m.title}"`,
    ),
  );
  notifyStaff(staffEmail(p.lead), `${p.client.name} approved "${m.title}"`, `The client signed off "${m.title}" on ${p.title}.`, p.code);
}

export function requestCourse(p: Project, techId: string, type: "info" | "enrol") {
  const tech = TECHNOLOGIES[techId];
  const course = COURSES[tech.courseId];
  addLead({ projectCode: p.code, projectTitle: p.title, clientName: p.client.name, techId, courseId: course.id, type });
  sendNotice({
    audience: "counsellor",
    channel: "email",
    to: "Admissions team · admissions@aptech.dev",
    subject: `New ${type === "enrol" ? "enrolment" : "info request"}: ${course.title}`,
    body: `${p.client.name} (${p.title}) clicked "${type === "enrol" ? "Enrol" : "Request info"}" on ${tech.name}.`,
    projectCode: p.code,
  });
}

export function setPromosOptOut(p: Project, optOut: boolean) {
  updateProject(p.code, (proj) => withActivity({ ...proj, promosOptOut: optOut }, `${proj.client.name} (Client)`, optOut ? "Turned off course suggestions" : "Turned on course suggestions"));
}

export function rateProject(p: Project, stars: number, text?: string) {
  updateProject(p.code, (proj) => withActivity({ ...proj, rating: { stars, text, at: new Date().toISOString() } }, `${proj.client.name} (Client)`, `Rated the project ${stars}/5`));
  notifyStaff(staffEmail(p.lead), `${p.client.name} rated ${p.title} ${stars}/5`, text || "No written testimonial.", p.code);
}

/* ---------- team → client ---------- */

export function postTeamReply(p: Project, author: Person, text: string) {
  updateProject(p.code, (proj) =>
    withActivity({ ...proj, messages: [...(proj.messages ?? []), { id: uid(), at: new Date().toISOString(), from: "team", author: author.name, text }] }, author, "Replied to the client"),
  );
  notifyClient(p, `${author.name} replied about ${p.title}`, text, "email");
}

export function announceUpdate(p: Project, u: Pick<Update, "title" | "body">) {
  notifyClient(p, `New update on ${p.title}: ${u.title}`, `${u.body}\n\nSign in with your Project ID to see more.`);
}

export function announceStage(p: Project, stage: StageKey, reason?: string) {
  notifyClient(p, `${p.title} is now: ${STAGES[stage].label}`, reason ?? STAGES[stage].meaning);
}

export function regenerateProjectCode(p: Project, actor: Person): string {
  const code = newProjectCode([]);
  updateProject(p.code, (proj) =>
    withActivity({ ...proj, code, revokedCodes: [...(proj.revokedCodes ?? []), proj.code] }, actor, `Regenerated Project ID (${proj.code} → ${code}). Old ID revoked.`),
  );
  const idea = readIdeas().find((i) => i.projectCode === p.code);
  if (idea) updateIdea(idea.id, { projectCode: code });
  notifyClient({ ...p, code }, "Your Project ID has changed", `For your security we issued a new Project ID: ${code}. Your old ID no longer works.`);
  return code;
}

export function assignMember(p: Project, person: Person, actor: Person) {
  if (p.team.some((m) => m.name === person.name)) return;
  updateProject(p.code, (proj) => withActivity({ ...proj, team: [...proj.team, person] }, actor, `Assigned ${person.name} (${person.role})`));
  notifyStaff(staffEmail(person), `You've been assigned to ${p.title}`, `${actor.name} added you to ${p.title} (${p.code}).`, p.code);
}

export function removeMember(p: Project, person: Person, actor: Person) {
  updateProject(p.code, (proj) => withActivity({ ...proj, team: proj.team.filter((m) => m.name !== person.name) }, actor, `Removed ${person.name} from the team`));
}

export function changeLead(p: Project, lead: Person, actor: Person) {
  updateProject(p.code, (proj) =>
    withActivity({ ...proj, lead, team: proj.team.some((m) => m.name === lead.name) ? proj.team : [lead, ...proj.team] }, actor, `Changed project lead to ${lead.name}`),
  );
  notifyStaff(staffEmail(lead), `You're now leading ${p.title}`, `${actor.name} made you project lead for ${p.title} (${p.code}).`, p.code);
}

export function shareFile(p: Project, file: Omit<SharedFile, "id" | "date">, actor: Person) {
  updateProject(p.code, (proj) =>
    withActivity({ ...proj, files: [{ ...file, id: uid(), date: new Date().toISOString(), uploadedBy: actor.name }, ...proj.files] }, actor, `Shared file ${file.name}`),
  );
  notifyClient(p, `New file shared on ${p.title}`, `${file.name} is ready to view and download in your portal.`, "email");
}

export function removeFile(p: Project, fileId: string, actor: Person) {
  const f = p.files.find((x) => x.id === fileId);
  updateProject(p.code, (proj) => withActivity({ ...proj, files: proj.files.filter((x) => x.id !== fileId) }, actor, `Removed file ${f?.name ?? ""}`));
}

/* ---------- ideas → projects ---------- */

export function submitIdeaForm(input: IdeaInput): Idea {
  const idea = submitIdea(input);
  sendNotice({ audience: "client", channel: "email", to: `${idea.name} · ${idea.email}`, subject: `We received your idea (${idea.ref})`, body: `Thanks for sharing ${idea.title}. We'll send a proposal within 2 working days. Check progress anytime with reference ${idea.ref}.` });
  notifyStaff("Admin team · admin@aptech.dev", `New idea submitted: ${idea.title}`, `${idea.name} (${idea.location}) · ${idea.category} · ${idea.budget}`);
  return idea;
}

export function convertIdeaToProject(idea: Idea, lead: Person, targetDate: string, actor: Person, notes?: string): string {
  const code = newProjectCode(readProjects().map((p) => p.code));
  const now = new Date().toISOString();
  const [first, second] = idea.name.split(" ");
  const digits = idea.phone.replace(/\D/g, "");
  const project: Project = withActivity(
    {
      code,
      title: idea.title,
      tagline: idea.problem.length > 90 ? `${idea.problem.slice(0, 87)}…` : idea.problem,
      category: idea.category,
      platforms: idea.platforms.join(" + "),
      client: {
        name: idea.name,
        short: second ? `${first} ${second[0]}.` : first,
        emailMasked: `${idea.email[0]}•••@${idea.email.split("@")[1]}`,
        phoneMasked: `+${digits.slice(0, 3)} ••• ••• ${digits.slice(-4)}`,
      },
      lead,
      team: [lead],
      stage: "APPROVED",
      progress: 5,
      startDate: now,
      targetDate: new Date(`${targetDate}T09:30:00`).toISOString(),
      updates: [{ id: uid(), date: now, kind: "stage", author: lead, title: "Welcome! Your project is registered", body: STAGES.APPROVED.meaning }],
      milestones: [{ id: uid(), title: "Proposal & quote accepted", due: now, completedAt: now }],
      stack: [],
      files: [],
      messages: [],
    },
    actor,
    `Registered client & project from idea ${idea.ref}`,
  );
  addProject(project);
  updateIdea(idea.id, { status: "ACCEPTED", projectCode: code, notes: notes ?? idea.notes });
  notifyClient(project, "Welcome to AI Project Connect! Your Project ID", `Your project ${idea.title} is registered. Your Project ID is ${code}. Sign in at the portal with this ID and the one-time code we send you.`);
  notifyStaff(staffEmail(lead), `You're leading a new project: ${idea.title}`, `${actor.name} registered ${idea.title} (${code}) for ${idea.name}.`, code);
  return code;
}

export function lookupIdea(ref: string) {
  const idea = findIdea(ref);
  if (!idea) return undefined;
  const project = idea.projectCode ? findProject(idea.projectCode) : undefined;
  return { idea, project };
}
