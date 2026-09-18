"use client";

import { createContext, useContext } from "react";
import { createCollection } from "./collection";
import type { Person, Project } from "./types";

/**
 * Staff accounts for the Engineering Panel (mock of /api/admin/users and /api/staff/auth/*).
 * Passwords are stored as salted SHA-256 hashes; the real back-end uses bcrypt.
 */

export type StaffRole = "admin" | "lead" | "engineer" | "counsellor";

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: StaffRole;
  jobTitle?: string;
  status: "active" | "disabled";
  passwordHash: string;
  createdAt: string;
  lastLoginAt?: string;
  /** Set when an admin creates the account or resets the password. */
  mustChangePassword?: boolean;
}

export const ROLES: Record<StaffRole, { label: string; description: string; className: string }> = {
  admin: { label: "Admin", description: "Full control: projects, ideas, website content, courses and user accounts.", className: "bg-navy text-white" },
  lead: { label: "Project lead", description: "Leads projects: changes stages, approves updates, manages milestones and the team.", className: "bg-brand-soft text-brand-700" },
  engineer: { label: "Engineer", description: "Works on assigned projects: posts updates, tags the stack, shares files, replies to clients.", className: "bg-blue-soft text-navy" },
  counsellor: { label: "Course counsellor", description: "Follows up course leads from “Learn this stack” and the website.", className: "bg-teal-soft text-teal-700" },
};

const created = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};

// Demo passwords: admin "Aptechdev123", everyone else "DemoStaff2026!" (same as the back-end demo seed).
const SEED: StaffUser[] = [
  { id: "u-admin", name: "Aptech Dev Team", email: "admin@aptechdevteam.com", role: "admin", jobTitle: "Administrator", status: "active", createdAt: created(120), passwordHash: "55fdefba6f16a9f9632c54386e0f563b30ffcc2ff89f5d3c34862b5def272fc0" },
  { id: "u-tunde", name: "Tunde Bakare", email: "tunde@aptech.test", phone: "08030000001", role: "lead", jobTitle: "Project lead", status: "active", createdAt: created(110), passwordHash: "f8c4a29bba6cc82db06ddbed85a0496e0b691251346a9b58a1ce5c64a96c3a61" },
  { id: "u-grace", name: "Grace Okon", email: "grace@aptech.test", phone: "08030000002", role: "lead", jobTitle: "Project lead", status: "active", createdAt: created(105), passwordHash: "4038bed8316245680f0f940220792a63dbacd4b08efa13a888f94994e803fb26" },
  { id: "u-chioma", name: "Chioma Eze", email: "chioma@aptech.test", role: "engineer", jobTitle: "Front-end engineer", status: "active", createdAt: created(100), passwordHash: "5bbe01ec9bb3891d6fadf9a0db41d2b72f58c273524b5cffe431d052a248d0a9" },
  { id: "u-ibrahim", name: "Ibrahim Sule", email: "ibrahim@aptech.test", role: "engineer", jobTitle: "Back-end engineer", status: "active", createdAt: created(98), passwordHash: "5ff301b7fc974c1f72ef4a6480c694aa30411370dc6f2fa8144a087a7cf125cc" },
  { id: "u-zainab", name: "Zainab Musa", email: "zainab@aptech.test", role: "engineer", jobTitle: "UI/UX designer", status: "active", createdAt: created(90), passwordHash: "ccdc83d060e506bd4f79f7247561e383a9642549e28cfafb3a8d46c60c3eee5b" },
  { id: "u-femi", name: "Femi Adeyemi", email: "femi@aptech.test", role: "engineer", jobTitle: "QA engineer", status: "active", createdAt: created(80), passwordHash: "0fc3f0785639c9e99aa6e08120346ba210fa467edf2c754f302bdfa15b79405c" },
  { id: "u-david", name: "David Nwosu", email: "david@aptech.test", role: "engineer", jobTitle: "Mobile engineer", status: "active", createdAt: created(75), passwordHash: "dcd1e854da20d387ec00f15ac0a1d6583b5a8918f52a564ecc8b387767594e3b" },
  { id: "u-aisha", name: "Aisha Bello", email: "aisha@aptech.test", role: "counsellor", jobTitle: "Course counsellor", status: "active", createdAt: created(60), passwordHash: "88a1f4a54b0ba206b82447555c615bc43c7cf1c249b0f09a57a3975cab4a8619" },
];

const users = createCollection<StaffUser>("apc-demo-staff-v1", SEED);

interface PasswordReset {
  tokenHash: string;
  userId: string;
  expiresAt: string;
  usedAt?: string;
}
const resets = createCollection<PasswordReset>("apc-demo-password-resets-v1", []);

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Creates a one-hour, single-use reset link for an active account.
 * Returns the token (so the demo can show the link) or null; the UI shows the same message either way.
 */
export async function requestPasswordReset(email: string): Promise<string | null> {
  const user = findUserByEmail(email);
  if (!user || user.status !== "active") return null;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  const tokenHash = await sha256(token);
  resets.set((all) => [...all.filter((r) => r.userId !== user.id || r.usedAt), { tokenHash, userId: user.id, expiresAt: new Date(Date.now() + 3600_000).toISOString() }]);
  return token;
}

export async function findValidReset(token: string) {
  const tokenHash = await sha256(token);
  const reset = resets.read().find((r) => r.tokenHash === tokenHash && !r.usedAt && new Date(r.expiresAt).getTime() > Date.now());
  const user = reset ? users.read().find((u) => u.id === reset.userId && u.status === "active") : undefined;
  return reset && user ? { reset, user } : null;
}

export async function resetPasswordWithToken(token: string, password: string): Promise<StaffUser | null> {
  const found = await findValidReset(token);
  if (!found) return null;
  await setStaffPassword(found.user.id, password, false);
  resets.set((all) => all.map((r) => (r.tokenHash === found.reset.tokenHash ? { ...r, usedAt: new Date().toISOString() } : r)).filter((r) => r.userId !== found.user.id || r.usedAt));
  return found.user;
}

export const useStaffUsers = () => users.useItems();
export const readStaffUsers = () => users.read();

export function findUserByEmail(email: string) {
  const e = email.trim().toLowerCase();
  return users.read().find((u) => u.email === e);
}

export async function hashPassword(email: string, password: string) {
  const data = new TextEncoder().encode(`apc-demo:${email.trim().toLowerCase()}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(user: StaffUser, password: string) {
  return (await hashPassword(user.email, password)) === user.passwordHash;
}

export function roleLabel(role: StaffRole) {
  return ROLES[role].label;
}

/** How a staff member appears on updates, replies and the activity log. */
export function personOf(user: StaffUser): Person {
  return { name: user.name, role: user.jobTitle || roleLabel(user.role) };
}

export function activeTeamMembers(list: StaffUser[]) {
  return list.filter((u) => u.status === "active" && u.role !== "counsellor");
}

export function activeLeads(list: StaffUser[]) {
  return list.filter((u) => u.status === "active" && (u.role === "lead" || u.role === "admin"));
}

/** Engineers and leads see projects they lead or are assigned to; admins see all (PRD section 09). */
export function canViewProject(user: StaffUser, project: Project) {
  if (user.role === "admin") return true;
  if (user.role === "counsellor") return false;
  return project.lead.name === user.name || project.team.some((m) => m.name === user.name);
}

/** Admins, or the lead of this project. */
export function canLeadProject(user: StaffUser, project: Project) {
  return user.role === "admin" || (user.role === "lead" && project.lead.name === user.name);
}

export function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("").replace(/^(.{4})(.{5})(.{5})$/, "$1-$2-$3");
}

export async function createStaffUser(input: { name: string; email: string; phone?: string; role: StaffRole; jobTitle?: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const user: StaffUser = {
    id: `u-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: input.name.trim(),
    email,
    phone: input.phone?.trim() || undefined,
    role: input.role,
    jobTitle: input.jobTitle?.trim() || undefined,
    status: "active",
    createdAt: new Date().toISOString(),
    passwordHash: await hashPassword(email, input.password),
    mustChangePassword: true,
  };
  users.set((all) => [...all, user]);
  return user;
}

export function updateStaffUser(id: string, patch: Partial<Omit<StaffUser, "id" | "email" | "passwordHash">>) {
  users.set((all) => all.map((u) => (u.id === id ? { ...u, ...patch } : u)));
}

export async function setStaffPassword(id: string, password: string, mustChange: boolean) {
  const user = users.read().find((u) => u.id === id);
  if (!user) return;
  const passwordHash = await hashPassword(user.email, password);
  users.set((all) => all.map((u) => (u.id === id ? { ...u, passwordHash, mustChangePassword: mustChange } : u)));
}

export function resetStaffUsers() {
  users.reset();
}

/* ---------- signed-in staff member ---------- */

export const StaffContext = createContext<StaffUser | null>(null);

export function useStaff(): StaffUser {
  const user = useContext(StaffContext);
  if (!user) throw new Error("useStaff must be used inside the Engineering Panel");
  return user;
}
