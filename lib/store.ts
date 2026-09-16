"use client";

import { PROJECTS } from "./data";
import { createCollection } from "./collection";
import type { CourseLead, Notice, Person, Project } from "./types";

function ago(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

const SEED_LEADS: CourseLead[] = [
  { id: "l1", at: ago(4), projectCode: "APC-26-7KQ9X", projectTitle: "FarmLink Marketplace", clientName: "Ada Okafor", techId: "react", courseId: "react", type: "info", status: "CONTACTED", notes: "Interested for her operations manager." },
  { id: "l2", at: ago(1), projectCode: "APC-26-M4TR8", projectTitle: "ClinicQueue", clientName: "Dr. Kemi Balogun", techId: "next", courseId: "next", type: "enrol", status: "NEW" },
];

const projects = createCollection<Project>("apc-demo-projects-v1", PROJECTS);
const leads = createCollection<CourseLead>("apc-demo-leads-v1", SEED_LEADS);
const outbox = createCollection<Notice>("apc-demo-outbox-v1", []);

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/* ---------- projects ---------- */

export const useProjects = () => projects.useItems();

export const readProjects = () => projects.read();

export function findProject(code: string): Project | undefined {
  return projects.read().find((p) => p.code === code.trim().toUpperCase());
}

/** Finds the project an old, regenerated Project ID used to belong to. */
export function findRevoked(code: string): Project | undefined {
  const c = code.trim().toUpperCase();
  return projects.read().find((p) => p.revokedCodes?.includes(c));
}

export function updateProject(code: string, fn: (p: Project) => Project) {
  projects.set((all) => all.map((p) => (p.code === code ? fn(p) : p)));
}

export function addProject(project: Project) {
  projects.set((all) => [project, ...all]);
}

export function withActivity(p: Project, actor: Person | string, action: string): Project {
  const who = typeof actor === "string" ? actor : `${actor.name} (${actor.role})`;
  return { ...p, activity: [{ id: uid(), at: new Date().toISOString(), actor: who, action }, ...(p.activity ?? [])] };
}

/* ---------- course leads ---------- */

export const useLeads = () => leads.useItems();

export function addLead(lead: Omit<CourseLead, "id" | "at" | "status">) {
  leads.set((all) => [{ ...lead, id: uid(), at: new Date().toISOString(), status: "NEW" }, ...all]);
}

export function updateLead(id: string, patch: Partial<CourseLead>) {
  leads.set((all) => all.map((l) => (l.id === id ? { ...l, ...patch } : l)));
}

/* ---------- notification outbox (mock email / SMS) ---------- */

export const useOutbox = () => outbox.useItems();

export function sendNotice(n: Omit<Notice, "id" | "at">) {
  outbox.set((all) => [{ ...n, id: uid(), at: new Date().toISOString() }, ...all].slice(0, 200));
}

export function notifyClient(p: Project, subject: string, body: string, channel: Notice["channel"] = "email+sms") {
  sendNotice({ audience: "client", channel, to: `${p.client.name} · ${p.client.emailMasked} · ${p.client.phoneMasked}`, subject, body, projectCode: p.code });
}

export function notifyStaff(to: string, subject: string, body: string, projectCode?: string) {
  sendNotice({ audience: "staff", channel: "email", to, subject, body, projectCode });
}

export function resetStore() {
  projects.reset();
  leads.reset();
  outbox.reset();
}
