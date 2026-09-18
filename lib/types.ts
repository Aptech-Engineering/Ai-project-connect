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
  /** Staff user id when the person is a team member. */
  id?: number | null;
  name: string;
  role: string;
}

export interface Course {
  id: string;
  title: string;
  duration: string;
  format: string;
  nextStart: string | null;
  /** Full price in the course currency, e.g. 185000. */
  price: number;
  currency: string;
  description?: string;
  discountPercent?: number;
  discountCode?: string;
  /** Promotional flier image stored in the browser (IndexedDB). */
  flierId?: string;
  /** External enrolment / payment page. */
  enrolUrl?: string;
  published: boolean;
}

export interface Technology {
  id: string;
  name: string;
  category: string;
  plain: string;
  mark: string;
  color: string;
  /** Linked course id, or "" when no course is linked. */
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
  /** Where the API serves it, e.g. /api/staff/files/abc123. */
  url?: string;
  /** Who shared it: the team (default) or the client. */
  source?: "team" | "client";
  note?: string;
}

export type ChangeRequestStatus = "SUBMITTED" | "REVIEWING" | "QUOTED" | "APPROVED" | "DECLINED" | "COMPLETED";

export interface ChangeRequest {
  id: string;
  title: string;
  description: string;
  requestedBy: "client" | "team";
  requesterName: string;
  status: ChangeRequestStatus;
  impactCost?: number;
  impactDays?: number;
  currency: string;
  responseNote?: string;
  createdAt: string;
  decidedAt?: string;
}

export interface HandoverItem {
  id: string;
  title: string;
  doneAt?: string;
  doneBy?: string;
}

export interface Handover {
  requestedAt?: string;
  signedAt?: string;
  signedName?: string;
  supportPlan?: string;
  items: HandoverItem[];
}

export interface CourseEvent {
  id: string;
  at: string;
  event: "view" | "click" | "request" | "enrol" | "invite";
  courseId: string;
  techId?: string;
  projectCode?: string;
}

export interface ActivityEntry {
  id: string;
  at: string;
  actorType: "staff" | "client" | "system";
  actor: string;
  action: string;
  projectCode?: string;
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
  /** Empty for enquiries from the public courses section. */
  projectCode: string;
  projectTitle: string;
  clientName: string;
  contact?: string;
  techId: string;
  courseId: string;
  type: "info" | "enrol";
  source?: "portal" | "website" | "invite";
  invitedBy?: string;
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
  id: string | number;
  at: string;
  actor: string;
  action: string;
  actorType?: "staff" | "client" | "system";
  projectCode?: string | null;
  projectTitle?: string | null;
  /** Where the action came from, for the audit trail. */
  ip?: string | null;
}

export interface Project {
  code: string;
  title: string;
  tagline: string;
  category: string;
  platforms: string;
  client: { name: string; short: string; emailMasked: string; phoneMasked: string; email?: string; phone?: string; organisation?: string };
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
  /** Weekly progress email (NT-04). */
  digestOptOut?: boolean;
  changeRequests?: ChangeRequest[];
  handover?: Handover;
  /** Commitment fee ledger of the application this project came from, when there was one. */
  wallet?: WalletLedgerEntry[] | null;
  /** Courses the client has already asked about from this project (client view only). */
  courseRequests?: { techId: string; type: "info" | "enrol" }[];
  budget?: string;
  /** Old Project IDs that were regenerated and no longer grant access. */
  revokedCodes?: string[];
}

/** One line of a commitment fee ledger, as the API returns it. */
export interface WalletLedgerEntry {
  type: "fee" | "payment" | "refund";
  label: string;
  amount: number;
  currency: string;
  status: string;
  reference?: string | null;
  at?: string | null;
  method?: string | null;
  receiptNo?: string | null;
  note?: string | null;
}
