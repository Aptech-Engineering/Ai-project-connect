import { STALE_DAYS, isClientVisible } from "@/lib/data";
import { daysFromNow } from "@/lib/format";
import { personOf, type StaffRole, type StaffUser } from "@/lib/staff";
import type { Person, Project } from "@/lib/types";

export type { StaffRole };

/** Admins and project leads can approve, change stages and manage teams. */
export const canLead = (role: StaffRole) => role === "admin" || role === "lead";

/** The signed-in staff member as they appear on updates, replies and the activity log. */
export function actingAs(user: StaffUser): Person {
  return personOf(user);
}

export function daysSinceClientUpdate(p: Project) {
  const last = p.updates.find(isClientVisible);
  return last ? -daysFromNow(last.date) : Infinity;
}

export function isStale(p: Project) {
  return p.stage !== "DELIVERED" && daysSinceClientUpdate(p) >= STALE_DAYS;
}
