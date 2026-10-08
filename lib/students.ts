"use client";

/**
 * The student register.
 *
 * Two audiences: the student's own phone at /student, which signs in with a Student
 * ID and a name and then remembers itself, and the counsellor's screen in the panel,
 * which keeps the register and records the money.
 */
import { api, query } from "./api";
import { invalidate, useApi } from "./remote";

const STAFF_KEY = "/staff/students";

/** The one answer the guard at the gate needs. Worked out on the server, never here. */
export interface Verdict {
  state: "CLEARED" | "ON_PLAN" | "DISCUSSION" | "PART_PAID" | "UNPAID" | "BLOCKED" | "WAIVED" | "NO_FEE";
  allowed: boolean;
  /** "CLEARED", "CLEARED — ON A PLAN" or "NOT CLEARED". */
  headline: string;
  detail: string;
  tone: "green" | "amber" | "red";
}

export interface StudentPayment {
  id?: number;
  amount: number;
  method: "cash" | "transfer" | "pos" | "paystack" | "other";
  reference: string | null;
  paidOn: string;
  note?: string | null;
  recordedBy?: string | null;
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
  fee: number;
  paid: number;
  outstanding: number;
  currency: string;
  gateNote: string | null;
  dueOn: string | null;
  verdict: Verdict;
  payments: StudentPayment[];
  /** When the server answered — the page shows it, so an old screenshot gives itself away. */
  checkedAt: string;
}

export async function studentSignIn(input: { studentId: string; firstName: string; lastName: string }) {
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
  fee: number;
  paid: number;
  outstanding: number;
  currency: string;
  standing: "AUTO" | "DISCUSSION" | "BLOCKED" | "WAIVED";
  /** Let them through the gate while an agreed plan runs. */
  gatePass: boolean;
  gateNote: string | null;
  note: string | null;
  startedOn: string | null;
  dueOn: string | null;
  active: boolean;
  /** When they last opened their own page. */
  lastSeenAt: string | null;
  createdAt: string;
  verdict: Verdict;
  payments?: StudentPayment[];
}

export interface StudentRegister {
  students: Student[];
  /** The next free Student ID, offered when adding someone. */
  suggestedId: string;
  /** The address to give students, e.g. https://aiprojectconnect.com.ng/student */
  page: string;
  stats: { total: number; cleared: number; owing: number; collected: number; outstanding: number };
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
  fee: number;
  standing: Student["standing"];
  gatePass: boolean;
  gateNote: string;
  note: string;
  startedOn: string | null;
  dueOn: string | null;
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

export async function deleteStudent(id: number) {
  await api.del(`${STAFF_KEY}/${id}`);
  await invalidate(STAFF_KEY);
}

export async function recordStudentPayment(
  id: number,
  payment: { amount: number; method?: StudentPayment["method"]; reference?: string; paidOn?: string; note?: string },
) {
  const student = await api.post<Student>(`${STAFF_KEY}/${id}/payments`, payment);
  await invalidate(STAFF_KEY);
  return student;
}

export async function deleteStudentPayment(id: number, paymentId: number) {
  const student = await api.del<Student>(`${STAFF_KEY}/${id}/payments/${paymentId}`);
  await invalidate(STAFF_KEY);
  return student;
}

/** One student with every payment, for the row that is open. */
export async function loadStudent(id: number) {
  return api.get<Student>(`${STAFF_KEY}/${id}`);
}
