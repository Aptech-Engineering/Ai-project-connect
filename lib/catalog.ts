"use client";

/**
 * Courses and technologies shown to clients ("Learn this stack").
 * Managed by admins in the Engineering Panel → Website → Courses / Technologies.
 */
import { useMemo } from "react";
import { api } from "./api";
import { invalidate, useApi } from "./remote";
import type { Course, Technology } from "./types";

export const CURRENCIES = ["NGN", "GHS", "KES", "ZAR", "USD", "GBP", "EUR", "INR", "AED"];

const COURSES = "/courses";
const TECHNOLOGIES = "/technologies";
const ADMIN_COURSES = "/admin/courses";

/** Last lists loaded from the server, so non-React code can read them synchronously. */
let courseSnapshot: Course[] = [];
let techSnapshot: Technology[] = [];

function keepCourses(list: Course[] | undefined) {
  if (list) courseSnapshot = list;
  return list ?? courseSnapshot;
}

function keepTechnologies(list: Technology[] | undefined) {
  if (list) techSnapshot = list;
  return list ?? techSnapshot;
}

/** Published courses for the public site and client portal. */
export function useCourses(): Course[] {
  const { data } = useApi<Course[]>(COURSES);
  return useMemo(() => keepCourses(data), [data]);
}

/** Every course, including unpublished ones (admin only). */
export function useAllCourses(): Course[] {
  const { data } = useApi<Course[]>(ADMIN_COURSES);
  return data ?? [];
}

/** The same list with its loading and error state, so a screen can tell "empty" from "not here yet". */
export function useAllCoursesState() {
  const { data, loading, error, refresh } = useApi<Course[]>(ADMIN_COURSES);
  return { courses: data ?? [], loading, error, refresh };
}

export function useTechnologies(): Technology[] {
  const { data } = useApi<Technology[]>(TECHNOLOGIES);
  return useMemo(() => keepTechnologies(data), [data]);
}

export const readCourses = () => courseSnapshot;
export const readTechnologies = () => techSnapshot;

/** Lookup maps for components. */
export function useCatalog() {
  const c = useCourses();
  const t = useTechnologies();
  return useMemo(
    () => ({
      courses: Object.fromEntries(c.map((x) => [x.id, x])) as Record<string, Course | undefined>,
      technologies: Object.fromEntries(t.map((x) => [x.id, x])) as Record<string, Technology | undefined>,
      courseList: c,
      technologyList: t,
    }),
    [c, t],
  );
}

/** Admin view: every course plus the technologies that link to them. */
export function useAdminCatalog() {
  const { courses, loading: loadingCourses, error: coursesError, refresh } = useAllCoursesState();
  const { data: techs, loading: loadingTech, error: techError } = useApi<Technology[]>(TECHNOLOGIES);
  const technologies = useMemo(() => keepTechnologies(techs), [techs]);
  return useMemo(
    () => ({ courseList: courses, technologyList: technologies, loading: loadingCourses || loadingTech, error: coursesError ?? techError, refresh }),
    [courses, technologies, loadingCourses, loadingTech, coursesError, techError, refresh],
  );
}

export const findCourse = (id: string) => courseSnapshot.find((c) => c.id === id);
export const findTechnology = (id: string) => techSnapshot.find((t) => t.id === id);

const courseBody = (c: Course) => ({
  title: c.title,
  description: c.description ?? "",
  duration: c.duration,
  format: c.format,
  nextStart: c.nextStart ? c.nextStart.slice(0, 10) : null,
  price: c.price,
  currency: c.currency,
  discountPercent: c.discountPercent ?? null,
  discountCode: c.discountCode ?? null,
  flierId: c.flierId ?? null,
  enrolUrl: c.enrolUrl ?? null,
  published: c.published,
});

/** Creates the course when `isNew`, otherwise saves changes to it. */
export async function saveCourse(course: Course, isNew = false) {
  const saved = isNew ? await api.post<Course>(ADMIN_COURSES, { id: course.id, ...courseBody(course) }) : await api.patch<Course>(`${ADMIN_COURSES}/${course.id}`, courseBody(course));
  await invalidate(COURSES, ADMIN_COURSES, TECHNOLOGIES);
  return saved;
}

export async function deleteCourse(id: string) {
  await api.del(`${ADMIN_COURSES}/${id}`);
  await invalidate(COURSES, ADMIN_COURSES, TECHNOLOGIES);
}

const techBody = (t: Technology) => ({
  name: t.name,
  category: t.category,
  plain: t.plain,
  mark: t.mark,
  color: t.color,
  courseId: t.courseId || null,
});

export async function saveTechnology(tech: Technology, isNew = false) {
  const saved = isNew ? await api.post<Technology>("/admin/technologies", { id: tech.id, ...techBody(tech) }) : await api.patch<Technology>(`/admin/technologies/${tech.id}`, techBody(tech));
  await invalidate(TECHNOLOGIES);
  return saved;
}

export async function deleteTechnology(id: string) {
  await api.del(`/admin/technologies/${id}`);
  await invalidate(TECHNOLOGIES);
}

export function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || `item-${Date.now().toString(36)}`
  );
}

export function formatPrice(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export function discountedPrice(course: Course) {
  return course.discountPercent ? Math.round(course.price * (1 - course.discountPercent / 100)) : course.price;
}
