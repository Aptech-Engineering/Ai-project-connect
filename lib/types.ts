export type StageKey =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "DESIGN"
  | "DEVELOPMENT"
  | "TESTING"
  | "DEPLOYMENT"
  | "DELIVERED"
  | "ON_HOLD";

export type Tone =
  | "grey"
  | "blue"
  | "orange-soft"
  | "orange"
  | "teal-soft"
  | "teal"
  | "red";

export interface StageInfo {
  label: string;
  tone: Tone;
  meaning: string;
  typical: string;
  /** Index on the client timeline (Review → Delivered). */
  step: number;
}

export interface Person {
  name: string;
  role: string;
}

export interface Course {
  id: string;
  title: string;
  duration: string;
  format: string;
  nextStart: string;
  fee: string;
}

export interface Technology {
  id: string;
  name: string;
  category: string;
  plain: string;
  mark: string;
  color: string;
  courseId: string;
}

export interface Update {
  id: string;
  date: string;
  title: string;
  body: string;
  author: Person;
  kind: "update" | "stage";
  /** Internal notes are never shown to clients. */
  visibility?: "client" | "internal";
  /** Waiting for project lead approval before clients see it. */
  pending?: boolean;
  demoLink?: string;
  screenshot?: "onboarding" | "payment" | "dashboard" | "design";
}

export interface Milestone {
  id: string;
  title: string;
  due: string;
  completedAt?: string;
  needsClientApproval?: boolean;
  clientApprovedAt?: string;
}

export interface SharedFile {
  id: string;
  name: string;
  kind: "proposal" | "design" | "doc";
  size: string;
  date: string;
  uploadedBy?: string;
}

export interface Message {
  id: string;
  at: string;
  from: "client" | "team";
  author: string;
  text: string;
}

export type LeadStatus = "NEW" | "CONTACTED" | "ENROLLED" | "NOT_INTERESTED";

export interface CourseLead {
  id: string;
  at: string;
  projectCode: string;
  projectTitle: string;
  clientName: string;
  techId: string;
  courseId: string;
  type: "info" | "enrol";
  status: LeadStatus;
  notes?: string;
}

export interface Notice {
  id: string;
  at: string;
  audience: "client" | "staff" | "counsellor";
  channel: "email" | "sms" | "email+sms";
  to: string;
  subject: string;
  body: string;
  projectCode?: string;
}

export interface Activity {
  id: string;
  at: string;
  actor: string;
  action: string;
}

export interface Project {
  code: string;
  title: string;
  tagline: string;
  category: string;
  platforms: string;
  client: { name: string; short: string; emailMasked: string; phoneMasked: string };
  lead: Person;
  team: Person[];
  stage: StageKey;
  /** Where the project was paused, for ON_HOLD. */
  pausedAtStep?: number;
  holdReason?: string;
  progress: number;
  startDate: string;
  targetDate: string;
  deliveredDate?: string;
  updates: Update[];
  milestones: Milestone[];
  stack: { techId: string; usage: string }[];
  files: SharedFile[];
  activity?: Activity[];
  messages?: Message[];
  rating?: { stars: number; text?: string; at: string };
  promosOptOut?: boolean;
  /** Old Project IDs that were regenerated and no longer grant access. */
  revokedCodes?: string[];
}
