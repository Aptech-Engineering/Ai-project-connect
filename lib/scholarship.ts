"use client";

/**
 * The scholarship programme (/scholarship): the public page, applying, paying the
 * form fee, and the applicant's own status page. Nobody signs in — the link we
 * email carries the reference and a token.
 */
import { api, apiUrl, formData, query } from "./api";
import { useApi } from "./remote";

export interface ScholarshipItem {
  title: string;
  description?: string;
}

export interface ScholarshipCheckout {
  fee: number;
  feeKobo: number;
  currency: string;
  feeTitle: string;
  feeExplainer: string;
  confirmationTime: string;
  paystack: { enabled: boolean; publicKey: string; mode: string };
  manual: { enabled: boolean; bankName: string; accountName: string; accountNumber: string; transferInstructions: string };
}

export interface ScholarshipProgramme {
  title: string;
  tagline: string | null;
  intro: string | null;
  fee: number;
  currency: string;
  seats: number | null;
  seatsLeft: number | null;
  deadline: string | null;
  open: boolean;
  closedMessage: string | null;
  courses: ScholarshipItem[];
  benefits: ScholarshipItem[];
  steps: ScholarshipItem[];
  contact: { address?: string; organisers?: string; phones?: string[] };
  examDates: { name: string; examDate: string | null; examTime: string | null }[];
  checkout: ScholarshipCheckout;
}

export interface ScholarshipStatus {
  ref: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  state: string;
  nationality: string;
  course: string | null;
  status: "PENDING" | "AWAITING_CONFIRMATION" | "PAID" | "FAILED";
  method: "paystack" | "manual" | null;
  amount: number;
  currency: string;
  reference: string | null;
  failureReason: string | null;
  appliedAt: string;
  paidAt: string | null;
  /** Only once the fee is confirmed and an admin has uploaded the form. */
  form: { label: string; url: string } | null;
  /** Paid, but nobody has uploaded the form yet. */
  formPending: boolean;
  batch: { name: string; examDate: string | null; examTime: string | null; venue: string | null; notes: string | null } | null;
  statusLink: string;
}

export interface Registration {
  ref: string;
  token: string;
  statusLink: string;
  amount: number;
  currency: string;
  status: ScholarshipStatus["status"];
}

export function useScholarship() {
  const { data, loading, error, refresh } = useApi<ScholarshipProgramme>("/scholarship");
  return { programme: data, loading, error, refresh };
}

export async function applyForScholarship(input: {
  name: string;
  email: string;
  phone: string;
  address: string;
  state: string;
  nationality: string;
  course?: string;
}) {
  return api.post<Registration>("/scholarship/apply", input);
}

/** Starts the online payment; the browser then goes to Paystack. */
export async function payScholarshipOnline(ref: string, token: string) {
  return api.post<{ authorizationUrl: string; reference: string }>("/scholarship/pay/paystack", { ref, token });
}

/** "I have transferred it": sender details and an optional receipt for an admin to check. */
export async function declareScholarshipTransfer(
  ref: string,
  token: string,
  input: { senderName: string; senderBank?: string; transferDate?: string; proof?: File },
) {
  return api.post<ScholarshipStatus>(
    "/scholarship/pay/manual",
    formData({ ref, token, senderName: input.senderName, senderBank: input.senderBank, transferDate: input.transferDate, proof: input.proof }),
  );
}

export function useScholarshipStatus(ref: string | null, token: string | null) {
  const path = ref && token ? `/scholarship/status${query({ ref, token })}` : null;
  const { data, loading, error, refresh } = useApi<ScholarshipStatus>(path);
  return { application: data, loading, error, refresh };
}

/** The form download link, which only answers once the fee is confirmed. */
export function scholarshipFormUrl(ref: string, token: string) {
  return apiUrl(`/scholarship/form${query({ ref, token })}`);
}
