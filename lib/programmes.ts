"use client";

/**
 * "Our programmes → Scholarship" in the Engineering Panel: the page an admin edits,
 * the form applicants download, the exam batches, and everyone who applied.
 */
import { api, formData } from "./api";
import { invalidate, useApi } from "./remote";
import type { ScholarshipItem } from "./scholarship";

const KEY = "/staff/scholarship";

export interface ScholarshipBatch {
  id: number;
  name: string;
  examDate: string | null;
  examTime: string | null;
  venue: string | null;
  capacity: number | null;
  notes: string | null;
  active: boolean;
  /** How many paid applicants sit in this batch. */
  assigned: number;
}

export interface ScholarshipApplicant {
  id: number;
  ref: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  state: string;
  nationality: string;
  course: string | null;
  batchId: number | null;
  batchName: string | null;
  examDate: string | null;
  status: "PENDING" | "AWAITING_CONFIRMATION" | "PAID" | "FAILED";
  method: "paystack" | "manual" | null;
  amount: number;
  currency: string;
  reference: string | null;
  senderName: string | null;
  senderBank: string | null;
  transferDate: string | null;
  /** The receipt they uploaded, if they paid by transfer. */
  proofUrl: string | null;
  failureReason: string | null;
  staffNote: string | null;
  appliedAt: string;
  paidAt: string | null;
}

/** A row of the "Course track" table, or a titled paragraph elsewhere on the page. */
export interface PartnerRow {
  title?: string;
  description?: string;
  track?: string;
  focus?: string;
  target?: string;
}

export interface PartnerContentFields {
  objectives: PartnerRow[];
  tracks: PartnerRow[];
  tracksNote: string;
  pathwaySteps: string[];
  pathwayIntro: string;
  pathwayDetails: PartnerRow[];
  eligibility: PartnerRow[];
  partnerWhy: string;
  aptechWhy: string;
  apcWhy: string;
}

/**
 * An organisation we run the scholarship with. Their page is hosted here, at
 * /scholarship/partner/<slug>, so they never have to touch their own website.
 */
export interface ScholarshipPartner {
  id: number;
  slug: string;
  name: string;
  fullName: string | null;
  logo: string | null;
  accent: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  programmeTitle: string | null;
  tagline: string | null;
  intro: string | null;
  content: Partial<PartnerContentFields>;
  active: boolean;
  /** The full address to hand the partner. */
  url: string;
  views: number;
  /** How many applicants arrived from their page. */
  applicants: number;
}

export interface ScholarshipAdminData {
  programme: {
    title: string;
    tagline: string | null;
    intro: string | null;
    fee: number;
    currency: string;
    seats: number | null;
    deadline: string | null;
    active: boolean;
    closedMessage: string | null;
    formLabel: string;
    formUploaded: boolean;
    formName: string | null;
    courses: ScholarshipItem[];
    benefits: ScholarshipItem[];
    steps: ScholarshipItem[];
    contact: { address?: string; organisers?: string; phones?: string[] };
  };
  batches: ScholarshipBatch[];
  partners: ScholarshipPartner[];
  applicants: ScholarshipApplicant[];
  stats: { total: number; paid: number; awaiting: number; unassigned: number; collected: number; seatsLeft: number | null };
}

export function useScholarshipAdmin() {
  const { data, loading, error, refresh } = useApi<ScholarshipAdminData>(KEY);
  return { data, loading, error, refresh };
}

export type ProgrammePatch = Partial<{
  title: string;
  tagline: string;
  intro: string;
  fee: number;
  seats: number | null;
  deadline: string | null;
  active: boolean;
  closedMessage: string;
  formLabel: string;
  courses: ScholarshipItem[];
  benefits: ScholarshipItem[];
  steps: ScholarshipItem[];
  contact: { address?: string; organisers?: string; phones?: string[] };
}>;

export async function saveProgramme(patch: ProgrammePatch) {
  const data = await api.put<ScholarshipAdminData>(KEY, patch);
  await invalidate(KEY);
  return data;
}

/** The PDF (or Word file) applicants download once their fee is confirmed. */
export async function uploadScholarshipForm(file: File) {
  const data = await api.post<ScholarshipAdminData>(`${KEY}/form`, formData({ file }));
  await invalidate(KEY);
  return data;
}

export type BatchPatch = Partial<{
  name: string;
  examDate: string | null;
  examTime: string | null;
  venue: string | null;
  capacity: number | null;
  notes: string | null;
  active: boolean;
}>;

export async function createBatch(patch: BatchPatch) {
  const data = await api.post<ScholarshipAdminData>(`${KEY}/batches`, patch);
  await invalidate(KEY);
  return data;
}

export async function updateBatch(id: number, patch: BatchPatch) {
  const data = await api.patch<ScholarshipAdminData>(`${KEY}/batches/${id}`, patch);
  await invalidate(KEY);
  return data;
}

export async function deleteBatch(id: number) {
  const data = await api.del<ScholarshipAdminData>(`${KEY}/batches/${id}`);
  await invalidate(KEY);
  return data;
}

/**
 * Confirm or reject the fee, place someone in a batch, or leave a note.
 * Confirming and placing both email the applicant.
 */
export async function updateApplicant(
  id: number,
  patch: { payment?: "confirm" | "reject"; reason?: string; batchId?: number | null; note?: string },
) {
  const data = await api.patch<ScholarshipAdminData>(`${KEY}/applicants/${id}`, patch);
  await invalidate(KEY);
  return data;
}

export async function deleteApplicant(id: number) {
  await api.del(`${KEY}/applicants/${id}`);
  await invalidate(KEY);
}

/* ---------------- partner landing pages ---------------- */

export type PartnerPatch = Partial<
  {
    name: string;
    slug: string;
    fullName: string;
    accent: string;
    website: string;
    email: string;
    phone: string;
    programmeTitle: string;
    tagline: string;
    intro: string;
    active: boolean;
  } & PartnerContentFields
>;

/** Adds a partner. Their page is live at the returned url straight away. */
export async function createPartner(patch: PartnerPatch) {
  const partner = await api.post<ScholarshipPartner>(`${KEY}/partners`, patch);
  await invalidate(KEY);
  return partner;
}

/** Sends only what changed; sections left out keep what they had. */
export async function updatePartner(id: number, patch: PartnerPatch) {
  const partner = await api.patch<ScholarshipPartner>(`${KEY}/partners/${id}`, patch);
  await invalidate(KEY);
  return partner;
}

export async function uploadPartnerLogo(id: number, file: File) {
  const partner = await api.post<ScholarshipPartner>(`${KEY}/partners/${id}/logo`, formData({ file }));
  await invalidate(KEY);
  return partner;
}

export async function deletePartner(id: number) {
  await api.del(`${KEY}/partners/${id}`);
  await invalidate(KEY);
}
