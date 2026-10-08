"use client";

/**
 * The student register.
 *
 * The student pass and the staff student register.
 */
import { api, query } from "./api";
import { invalidate, useApi } from "./remote";

const STAFF_KEY = "/staff/students";

/** The one answer the guard at the gate needs. Worked out on the server, never here. */
export interface Verdict {
  state: "CLEARED" | "NOT_CLEARED";
  allowed: boolean;
  /** "CLEARED" or "NOT CLEARED". */
  headline: string;
  detail: string;
  tone: "green" | "amber" | "red";
}

/** What the student's own phone is given — their record and nothing else. */
export interface StudentProfile {
  studentId: string;
  token: string;
  firstName: string;
  lastName: string;
  name: string;
  course: string | null;
  batch: string | null;
  gateNote: string | null;
  verdict: Verdict;
  /** When the server answered — the page shows it, so an old screenshot gives itself away. */
  checkedAt: string;
}

/**
 * The name is enough. A Student ID or a phone number is only needed when two
 * students share a name — the server says so, and the form then asks for one.
 */
export async function studentSignIn(input: { firstName: string; lastName: string; studentId?: string; phone?: string }) {
  return api.post<StudentProfile>("/students/sign-in", input);
}

/** A refresh, with the token the phone kept instead of the name. */
export async function studentStatus(studentId: string, token: string) {
  return api.get<StudentProfile>(`/students/status${query({ id: studentId, token })}`);
}

/* ---------------- the counsellor's register ---------------- */

export interface Student {
  id: number;
  studentId: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string | null;
  email: string | null;
  course: string | null;
  batch: string | null;
  standing: "AUTO" | "DISCUSSION" | "BLOCKED" | "WAIVED";
  gateNote: string | null;
  note: string | null;
  startedOn: string | null;
  active: boolean;
  /** When they last opened their own page. */
  lastSeenAt: string | null;
  createdAt: string;
  verdict: Verdict;
}

export interface StudentRegister {
  students: Student[];
  /** The next free Student ID, offered when adding someone. */
  suggestedId: string;
  /** The address to give students, e.g. https://aiprojectconnect.com.ng/student */
  page: string;
  stats: { total: number; cleared: number; owing: number };
}

export function useStudents() {
  return useApi<StudentRegister>(STAFF_KEY);
}

export type StudentPatch = Partial<{
  studentId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  course: string;
  batch: string;
  standing: "BLOCKED" | "WAIVED";
  gateNote: string;
  note: string;
  startedOn: string | null;
  active: boolean;
}>;

export async function createStudent(patch: StudentPatch) {
  const student = await api.post<Student>(STAFF_KEY, patch);
  await invalidate(STAFF_KEY);
  return student;
}

export async function updateStudent(id: number, patch: StudentPatch) {
  const student = await api.patch<Student>(`${STAFF_KEY}/${id}`, patch);
  await invalidate(STAFF_KEY);
  return student;
}

/**
 * A new clearance month: every active student goes back to not cleared, and the
 * office clears them again as they settle up. Admins only.
 */
export async function resetClearance() {
  const result = await api.post<{ reset: number }>(`${STAFF_KEY}/clearance/reset`, {});
  await invalidate(STAFF_KEY);
  return result.reset;
}

export async function deleteStudent(id: number) {
  await api.del(`${STAFF_KEY}/${id}`);
  await invalidate(STAFF_KEY);
}

/** One student record, for the row that is open. */
export async function loadStudent(id: number) {
  return api.get<Student>(`${STAFF_KEY}/${id}`);
}
