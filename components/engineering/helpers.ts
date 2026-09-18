import { STALE_DAYS, isClientVisible } from "@/lib/data";
import { daysFromNow } from "@/lib/format";
import type { StaffRole, StaffUser } from "@/lib/staff";
import type { ProjectSummary } from "@/lib/store";
import type { Project } from "@/lib/types";

export type { StaffRole };

/** Admins and project leads can approve, change stages and manage teams. */
export const canLead = (role: StaffRole) => role === "admin" || role === "lead";

/* ---------------- small rules the UI shows ---------------- */

/**
 * Whether to offer stage controls on a list row. The server decides for real;
 * summaries only carry the lead's name, so that is what we can compare.
 */
export function canLeadSummary(user: StaffUser, project: ProjectSummary) {
  return user.role === "admin" || (user.role === "lead" && project.leadName === user.name);
}

export function daysSinceClientUpdate(p: Project) {
  const last = p.updates.find(isClientVisible);
  return last ? -daysFromNow(last.date) : Infinity;
}

export function isStale(p: Project) {
  return p.stage !== "DELIVERED" && daysSinceClientUpdate(p) >= STALE_DAYS;
}

/**
 * Files come back with an absolute API path (`/api/staff/files/…`); lib/files.ts
 * adds the API base itself, so hand it the part after it.
 */
export function apiPath(url?: string | null) {
  return url ? url.replace(/^\/api(?=\/)/, "") : null;
}
