import { STALE_DAYS, isClientVisible } from "@/lib/data";
import { daysFromNow } from "@/lib/format";
import type { Person, Project } from "@/lib/types";

export type StaffRole = "lead" | "engineer";

export function actingAs(role: StaffRole): Person {
  return { name: "Aptech Dev Team", role: role === "lead" ? "Project lead" : "Engineer" };
}

export function daysSinceClientUpdate(p: Project) {
  const last = p.updates.find(isClientVisible);
  return last ? -daysFromNow(last.date) : Infinity;
}

export function isStale(p: Project) {
  return p.stage !== "DELIVERED" && daysSinceClientUpdate(p) >= STALE_DAYS;
}
