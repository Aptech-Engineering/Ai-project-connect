"use client";

import { useMemo } from "react";
import { createCollection } from "./collection";
import type { Course, Technology } from "./types";

/**
 * Courses and technologies shown to clients ("Learn this stack").
 * Managed by admins in the Engineering Panel → Website → Courses / Technologies.
 */

function day(offset: number): string {
  const d = new Date();
  d.setHours(9, 30, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toISOString();
}

export const CURRENCIES = ["NGN", "GHS", "KES", "ZAR", "USD", "GBP", "EUR", "INR", "AED"];

const DEFAULT_COURSES: Course[] = [
  { id: "react", title: "Front-End Web Development with React", duration: "12 weeks", format: "Hybrid · Weekends", nextStart: day(21), price: 185000, currency: "NGN", discountPercent: 10, discountCode: "APC10", published: true, description: "Build modern, responsive websites and web apps with React, from components to deployment." },
  { id: "next", title: "Full-Stack Apps with Next.js", duration: "10 weeks", format: "Online · Live classes", nextStart: day(28), price: 210000, currency: "NGN", discountPercent: 10, discountCode: "APC10", published: true, description: "Go full-stack: pages, APIs, authentication and SEO with Next.js." },
  { id: "node", title: "Back-End APIs with Node.js & Express", duration: "10 weeks", format: "In-centre · Weekdays", nextStart: day(14), price: 175000, currency: "NGN", discountPercent: 10, discountCode: "APC10", published: true, description: "Design and build secure REST APIs that power web and mobile apps." },
  { id: "nest", title: "Scalable APIs with NestJS", duration: "8 weeks", format: "Online · Evenings", nextStart: day(35), price: 195000, currency: "NGN", discountPercent: 10, discountCode: "APC10", published: true },
  { id: "postgres", title: "Databases & SQL with PostgreSQL", duration: "6 weeks", format: "Hybrid · Evenings", nextStart: day(10), price: 120000, currency: "NGN", discountPercent: 10, discountCode: "APC10", published: true },
  { id: "flutter", title: "Mobile App Development with Flutter", duration: "14 weeks", format: "In-centre · Weekends", nextStart: day(24), price: 220000, currency: "NGN", discountPercent: 10, discountCode: "APC10", published: true, description: "Ship Android and iPhone apps from a single codebase with Flutter." },
  { id: "rn", title: "Cross-Platform Apps with React Native", duration: "12 weeks", format: "Online · Live classes", nextStart: day(31), price: 205000, currency: "NGN", discountPercent: 10, discountCode: "APC10", published: true },
  { id: "figma", title: "UI/UX Design with Figma", duration: "8 weeks", format: "Hybrid · Weekends", nextStart: day(7), price: 140000, currency: "NGN", discountPercent: 10, discountCode: "APC10", published: true, description: "Design beautiful, usable screens and prototypes that engineers love to build." },
  { id: "cloud", title: "Cloud Deployment & DevOps Essentials", duration: "8 weeks", format: "Online · Evenings", nextStart: day(42), price: 190000, currency: "NGN", discountPercent: 10, discountCode: "APC10", published: true },
  { id: "firebase", title: "Serverless Apps with Firebase", duration: "6 weeks", format: "Online · Self-paced + mentor", nextStart: day(12), price: 110000, currency: "NGN", discountPercent: 10, discountCode: "APC10", published: true },
];

const DEFAULT_TECHNOLOGIES: Technology[] = [
  { id: "react", name: "React", category: "Front-end", mark: "Re", color: "#61DAFB", courseId: "react", plain: "Builds the screens your customers see and click on in their web browser." },
  { id: "next", name: "Next.js", category: "Front-end", mark: "N", color: "#FFFFFF", courseId: "next", plain: "Makes your website fast and easy for Google to find." },
  { id: "node", name: "Node.js", category: "Back-end", mark: "Nd", color: "#8CC84B", courseId: "node", plain: "The engine behind the scenes that handles logins, orders and payments." },
  { id: "nest", name: "NestJS", category: "Back-end", mark: "Ns", color: "#E0234E", courseId: "nest", plain: "Keeps the behind-the-scenes code organised as your app grows." },
  { id: "postgres", name: "PostgreSQL", category: "Database", mark: "Pg", color: "#6FA8DC", courseId: "postgres", plain: "Where your app safely stores its data — users, products and orders." },
  { id: "flutter", name: "Flutter", category: "Mobile", mark: "Fl", color: "#54C5F8", courseId: "flutter", plain: "Builds your Android (and later iPhone) app from one set of code." },
  { id: "rn", name: "React Native", category: "Mobile", mark: "RN", color: "#61DAFB", courseId: "rn", plain: "Lets one team build your app for both Android and iPhone." },
  { id: "figma", name: "Figma", category: "Design", mark: "Fg", color: "#F24E1E", courseId: "figma", plain: "Where your screens are drawn and approved before any code is written." },
  { id: "aws", name: "AWS Cloud", category: "Hosting", mark: "Aw", color: "#FF9900", courseId: "cloud", plain: "The rented computers that keep your app online day and night." },
  { id: "firebase", name: "Firebase", category: "Back-end", mark: "Fb", color: "#FFCA28", courseId: "firebase", plain: "Sends instant notifications and keeps data in sync across phones." },
];

const courses = createCollection<Course>("apc-cms-courses-v1", DEFAULT_COURSES);
const technologies = createCollection<Technology>("apc-cms-technologies-v1", DEFAULT_TECHNOLOGIES);

export const useCourses = () => courses.useItems();
export const useTechnologies = () => technologies.useItems();
export const readCourses = () => courses.read();
export const readTechnologies = () => technologies.read();

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

export const findCourse = (id: string) => courses.read().find((c) => c.id === id);
export const findTechnology = (id: string) => technologies.read().find((t) => t.id === id);

export function saveCourse(course: Course) {
  courses.set((all) => (all.some((c) => c.id === course.id) ? all.map((c) => (c.id === course.id ? course : c)) : [...all, course]));
}

export function deleteCourse(id: string) {
  courses.set((all) => all.filter((c) => c.id !== id));
  technologies.set((all) => all.map((t) => (t.courseId === id ? { ...t, courseId: "" } : t)));
}

export function saveTechnology(tech: Technology) {
  technologies.set((all) => (all.some((t) => t.id === tech.id) ? all.map((t) => (t.id === tech.id ? tech : t)) : [...all, tech]));
}

export function deleteTechnology(id: string) {
  technologies.set((all) => all.filter((t) => t.id !== id));
}

export function resetCatalog() {
  courses.reset();
  technologies.reset();
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
