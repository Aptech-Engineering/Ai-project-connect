"use client";

/**
 * Staff accounts and the signed-in session for the Engineering Panel.
 * Backed by /api/staff/auth/*, /api/staff/users and /api/admin/users.
 */
import { createContext, useContext } from "react";
import { api } from "./api";
import { clearCache, invalidate, useApi } from "./remote";
import type { Person, Project } from "./types";

export type StaffRole = "admin" | "lead" | "engineer" | "counsellor";

export interface StaffUser {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  role: StaffRole;
  roleLabel?: string;
  jobTitle?: string | null;
  status: "active" | "disabled";
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
}

export const ROLES: Record<StaffRole, { label: string; description: string; className: string }> = {
  admin: { label: "Admin", description: "Full control: projects, ideas, website content, courses and user accounts.", className: "bg-navy text-white" },
  lead: { label: "Project lead", description: "Leads projects: changes stages, approves updates, manages milestones and the team.", className: "bg-brand-soft text-brand-700" },
  engineer: { label: "Engineer", description: "Works on assigned projects: posts updates, tags the stack, shares files, replies to clients.", className: "bg-blue-soft text-navy" },
  counsellor: { label: "Course counsellor", description: "Follows up course leads from “Learn this stack” and the website.", className: "bg-teal-soft text-teal-700" },
};

const ME = "/staff/me";
const TEAM = "/staff/users";
const ADMIN_USERS = "/admin/users";

/* ---------------- session ---------------- */

/** The signed-in staff member, or undefined while loading / signed out. */
export function useStaffSession() {
  const { data, error, loading, refresh } = useApi<{ user: StaffUser }>(ME);
  return { user: data?.user, error, loading, refresh };
}

export async function signIn(email: string, password: string) {
  const { user } = await api.post<{ user: StaffUser }>("/staff/auth/login", { email: email.trim(), password });
  clearCache();
  await invalidate(ME);
  return user;
}

export async function signOut() {
  try {
    await api.post("/staff/auth/logout");
  } finally {
    clearCache();
  }
}

export async function changeOwnPassword(currentPassword: string, newPassword: string) {
  await api.post("/staff/me/password", { currentPassword, newPassword });
  await invalidate(ME);
}

/**
 * Asks for a reset link. The response is the same whether or not the account
 * exists; outside production it also returns the token so the demo can show the link.
 */
export async function requestPasswordReset(email: string) {
  return api.post<{ message: string; devToken?: string }>("/staff/auth/forgot-password", { email: email.trim() });
}

export async function resetPasswordWithToken(token: string, password: string) {
  return api.post<{ message?: string }>("/staff/auth/reset-password", { token, password });
}

/* ---------------- people ---------------- */

/** Active staff, for assigning work. */
export function useStaffUsers(): StaffUser[] {
  const { data } = useApi<StaffUser[]>(TEAM);
  return data ?? [];
}

/** Every account including disabled ones (admin only). */
export function useAllStaffUsers() {
  const { data, loading, error, refresh } = useApi<StaffUser[]>(ADMIN_USERS);
  return { users: data ?? [], loading, error, refresh };
}

export function roleLabel(role: StaffRole) {
  return ROLES[role].label;
}

/** How a staff member appears on updates, replies and the activity log. */
export function personOf(user: StaffUser): Person {
  return { id: user.id, name: user.name, role: user.jobTitle || roleLabel(user.role) };
}

export function activeTeamMembers(list: StaffUser[]) {
  return list.filter((u) => u.status === "active" && u.role !== "counsellor");
}

export function activeLeads(list: StaffUser[]) {
  return list.filter((u) => u.status === "active" && (u.role === "lead" || u.role === "admin"));
}

const isSamePerson = (user: StaffUser, person: Person) => (person.id !== undefined && person.id !== null ? person.id === user.id : person.name === user.name);

/** Engineers and leads see projects they lead or are assigned to; admins see all (PRD section 09). */
export function canViewProject(user: StaffUser, project: Project) {
  if (user.role === "admin") return true;
  if (user.role === "counsellor") return false;
  return isSamePerson(user, project.lead) || project.team.some((m) => isSamePerson(user, m));
}

/** Admins, or the lead of this project. */
export function canLeadProject(user: StaffUser, project: Project) {
  return user.role === "admin" || (user.role === "lead" && isSamePerson(user, project.lead));
}

export function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length])
    .join("")
    .replace(/^(.{4})(.{5})(.{5})$/, "$1-$2-$3");
}

export async function createStaffUser(input: { name: string; email: string; phone?: string; role: StaffRole; jobTitle?: string; password: string }) {
  const user = await api.post<StaffUser>(ADMIN_USERS, {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null,
    role: input.role,
    jobTitle: input.jobTitle?.trim() || null,
    password: input.password,
  });
  await invalidate(ADMIN_USERS, TEAM);
  return user;
}

export async function updateStaffUser(id: number, patch: { name?: string; phone?: string | null; role?: StaffRole; jobTitle?: string | null; status?: "active" | "disabled" }) {
  const user = await api.patch<StaffUser>(`${ADMIN_USERS}/${id}`, patch);
  await invalidate(ADMIN_USERS, TEAM, ME);
  return user;
}

/** Admin sets a new password; the account must change it at the next sign-in. */
export async function setStaffPassword(id: number, password: string) {
  await api.patch(`${ADMIN_USERS}/${id}`, { password });
  await invalidate(ADMIN_USERS);
}

/* ---------------- signed-in staff member ---------------- */

export const StaffContext = createContext<StaffUser | null>(null);

export function useStaff(): StaffUser {
  const user = useContext(StaffContext);
  if (!user) throw new Error("useStaff must be used inside the Engineering Panel");
  return user;
}
