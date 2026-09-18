import type { Project, StageInfo, StageKey, Update } from "./types";

export const STALE_DAYS = 5;

export const TIMELINE = ["Review", "Design", "Develop", "Testing", "Deploy", "Delivered"];

export const STAGES: Record<StageKey, StageInfo> = {
  SUBMITTED: { label: "Submitted", tone: "grey", step: 0, typical: "0%", meaning: "We've received your idea and will review it shortly." },
  UNDER_REVIEW: { label: "Under review", tone: "blue", step: 0, typical: "0%", meaning: "Our team is assessing your idea and preparing a proposal." },
  APPROVED: { label: "Approved", tone: "blue", step: 0, typical: "5%", meaning: "Proposal accepted. Your project is registered and a team is assigned." },
  DESIGN: { label: "Design", tone: "orange-soft", step: 1, typical: "10–25%", meaning: "We're planning screens and user flows. You'll be asked to approve them." },
  DEVELOPMENT: { label: "In development", tone: "orange", step: 2, typical: "25–75%", meaning: "Engineers are building the features of your product." },
  TESTING: { label: "Testing", tone: "orange-soft", step: 3, typical: "75–90%", meaning: "We're checking everything works correctly and fixing issues." },
  DEPLOYMENT: { label: "Deployment", tone: "teal-soft", step: 4, typical: "90–99%", meaning: "Your product is being published online / to app stores." },
  DELIVERED: { label: "Delivered", tone: "teal", step: 5, typical: "100%", meaning: "Your product is live and handed over. Congratulations!" },
  ON_HOLD: { label: "On hold", tone: "red", step: 0, typical: "—", meaning: "Paused for now — the reason is shown below." },
};

/** Lowest typical progress for each stage (PRD section 08). */
export const STAGE_MIN_PROGRESS: Partial<Record<StageKey, number>> = { APPROVED: 5, DESIGN: 10, DEVELOPMENT: 25, TESTING: 75, DEPLOYMENT: 90, DELIVERED: 100 };

export function isClientVisible(u: Update) {
  return (u.visibility ?? "client") === "client" && !u.pending;
}

export function clientUpdates(project: Project) {
  return project.updates.filter(isClientVisible);
}

export function timelineStep(project: Project): number {
  return project.stage === "ON_HOLD" ? project.pausedAtStep ?? 0 : STAGES[project.stage].step;
}
