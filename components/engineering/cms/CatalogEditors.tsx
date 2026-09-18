"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgePercent, CalendarDays, Copy, Eye, EyeOff, GraduationCap, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import StoredImage from "../../StoredImage";
import { Card, Field, ImagePicker, TextArea, TextInput, Toggle, inputClass } from "./fields";
import { CURRENCIES, deleteCourse, deleteTechnology, discountedPrice, formatPrice, saveCourse, saveTechnology, slugify, useCatalog } from "@/lib/catalog";
import { cn, formatDate } from "@/lib/format";
import type { Course, Technology } from "@/lib/types";
import type { Notify } from "../../PortalApp";

/* ---------------- Courses ---------------- */

function blankCourse(): Course {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return { id: "", title: "", duration: "8 weeks", format: "Hybrid · Weekends", nextStart: d.toISOString(), price: 0, currency: "NGN", published: false };
}

export function CoursesEditor({ notify }: { notify: Notify }) {
  const { courseList, technologyList } = useCatalog();
  const [editing, setEditing] = useState<Course | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <Card
      title="Courses & pricing"
      description="Changes to courses are saved immediately."
      action={
        <button onClick={() => setEditing(blankCourse())} className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-600">
          <Plus className="size-4" /> Add course
        </button>
      }
    >
      <ul className="space-y-2.5">
        {courseList.map((c) => {
          const techs = technologyList.filter((t) => t.courseId === c.id);
          return (
            <motion.li key={c.id} layout className="flex flex-col gap-3 rounded-xl border border-line p-3 sm:flex-row sm:items-center">
              <div className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-navy">
                {c.flierId ? <StoredImage id={c.flierId} alt="" className="size-full object-cover" /> : <GraduationCap className="size-6 text-brand" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display font-semibold">{c.title}</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", c.published ? "bg-teal-soft text-teal-700" : "bg-mist text-muted")}>
                    {c.published ? "Published" : "Draft"}
                  </span>
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                  <span className="font-bold text-navy">
                    {c.discountPercent ? (
                      <>
                        {formatPrice(discountedPrice(c), c.currency)} <span className="font-normal text-muted line-through">{formatPrice(c.price, c.currency)}</span>
                      </>
                    ) : (
                      formatPrice(c.price, c.currency)
                    )}
                  </span>
                  {c.discountPercent ? (
                    <span className="flex items-center gap-1 text-teal-700">
                      <BadgePercent className="size-3" /> {c.discountPercent}%{c.discountCode ? ` · ${c.discountCode}` : ""}
                    </span>
                  ) : null}
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-3" /> {formatDate(c.nextStart)}
                  </span>
                  <span>{c.duration}</span>
                  {techs.length > 0 && <span>Linked: {techs.map((t) => t.name).join(", ")}</span>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <IconButton
                  label={c.published ? "Unpublish" : "Publish"}
                  onClick={() => {
                    saveCourse({ ...c, published: !c.published });
                    notify(c.published ? `${c.title} hidden from the site.` : `${c.title} is now live.`, "info");
                  }}
                >
                  {c.published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </IconButton>
                <IconButton label="Duplicate" onClick={() => setEditing({ ...c, id: "", title: `${c.title} (copy)`, published: false })}>
                  <Copy className="size-4" />
                </IconButton>
                <IconButton label="Edit" onClick={() => setEditing(c)}>
                  <Pencil className="size-4" />
                </IconButton>
                {confirmDelete === c.id ? (
                  <span className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        deleteCourse(c.id);
                        setConfirmDelete(null);
                        notify(`${c.title} deleted.`, "info");
                      }}
                      className="rounded-lg bg-danger px-2.5 py-1.5 text-xs font-bold text-white"
                    >
                      Delete
                    </button>
                    <IconButton label="Cancel" onClick={() => setConfirmDelete(null)}>
                      <X className="size-4" />
                    </IconButton>
                  </span>
                ) : (
                  <IconButton label="Delete" danger onClick={() => setConfirmDelete(c.id)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                )}
              </div>
            </motion.li>
          );
        })}
        {courseList.length === 0 && <li className="rounded-xl border border-dashed border-line py-10 text-center text-sm text-muted">No courses yet.</li>}
      </ul>

      <Drawer open={Boolean(editing)} title={editing?.id ? "Edit course" : "New course"} onClose={() => setEditing(null)}>
        {editing && (
          <CourseForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={(course) => {
              const isNew = !course.id;
              let id = course.id;
              if (isNew) {
                const base = slugify(course.title);
                id = base;
                let n = 2;
                while (courseList.some((c) => c.id === id)) id = `${base}-${n++}`;
              }
              saveCourse({ ...course, id });
              setEditing(null);
              notify(isNew ? `${course.title} added${course.published ? " and published" : " as a draft"}.` : `${course.title} saved.`);
            }}
          />
        )}
      </Drawer>
    </Card>
  );
}

function CourseForm({ initial, onSave, onCancel }: { initial: Course; onSave: (c: Course) => void; onCancel: () => void }) {
  const [c, setC] = useState<Course>(initial);
  const [error, setError] = useState("");
  const set = (patch: Partial<Course>) => setC((x) => ({ ...x, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (c.title.trim().length < 3) return setError("Give the course a title.");
    if (!Number.isFinite(c.price) || c.price < 0) return setError("Enter a valid price.");
    if (c.discountPercent != null && (c.discountPercent < 0 || c.discountPercent > 100)) return setError("Discount must be between 0 and 100%.");
    if (c.enrolUrl && !/^https?:\/\/\S+\.\S+/.test(c.enrolUrl)) return setError("Enrolment link must start with https://");
    onSave({
      ...c,
      title: c.title.trim(),
      discountPercent: c.discountPercent || undefined,
      discountCode: c.discountCode?.trim() || undefined,
      enrolUrl: c.enrolUrl?.trim() || undefined,
      description: c.description?.trim() || undefined,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <TextInput label="Course title" value={c.title} onChange={(v) => set({ title: v })} />
      <TextArea label="Description" value={c.description ?? ""} onChange={(v) => set({ description: v })} placeholder="What will students learn?" />
      <ImagePicker label="Flier" value={c.flierId} onChange={(flierId) => set({ flierId })} />

      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <Field label="Price" id="course-price">
          <input
            id="course-price"
            type="number"
            min={0}
            step={500}
            value={Number.isFinite(c.price) ? c.price : ""}
            onChange={(e) => set({ price: e.target.value === "" ? NaN : Number(e.target.value) })}
            className={cn(inputClass, "h-11")}
          />
        </Field>
        <Field label="Currency" id="course-currency">
          <select id="course-currency" value={c.currency} onChange={(e) => set({ currency: e.target.value })} className={cn(inputClass, "h-11")}>
            {CURRENCIES.map((cur) => (
              <option key={cur}>{cur}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client discount (%)" id="course-discount">
          <input
            id="course-discount"
            type="number"
            min={0}
            max={100}
            value={c.discountPercent ?? ""}
            onChange={(e) => set({ discountPercent: e.target.value === "" ? undefined : Number(e.target.value) })}
            className={cn(inputClass, "h-11")}
          />
        </Field>
        <TextInput label="Discount code" value={c.discountCode ?? ""} onChange={(v) => set({ discountCode: v.toUpperCase() })} placeholder="APC10" />
      </div>
      {Number.isFinite(c.price) && c.price > 0 && (
        <p className="rounded-xl bg-mist px-3 py-2 text-sm">
          Students pay <b>{formatPrice(discountedPrice(c), c.currency)}</b>
          {c.discountPercent ? <span className="text-muted"> (was {formatPrice(c.price, c.currency)})</span> : null}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Duration" value={c.duration} onChange={(v) => set({ duration: v })} placeholder="12 weeks" />
        <TextInput label="Format" value={c.format} onChange={(v) => set({ format: v })} placeholder="Hybrid · Weekends" />
      </div>
      <Field label="Next start date" id="course-start">
        <input
          id="course-start"
          type="date"
          value={c.nextStart.slice(0, 10)}
          onChange={(e) => e.target.value && set({ nextStart: new Date(`${e.target.value}T09:30:00`).toISOString() })}
          className={cn(inputClass, "h-11")}
        />
      </Field>
      <TextInput label="Online enrolment / payment link (optional)" value={c.enrolUrl ?? ""} onChange={(v) => set({ enrolUrl: v })} placeholder="https://…" />
      <Toggle label="Published" hint="Draft courses are hidden from the site and client portal." checked={c.published} onChange={(v) => set({ published: v })} />

      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger">{error}</p>}
      <FormActions onCancel={onCancel} />
    </form>
  );
}

/* ---------------- Technologies ---------------- */

function blankTech(): Technology {
  return { id: "", name: "", category: "Front-end", plain: "", mark: "", color: "#61DAFB", courseId: "" };
}

export function TechnologiesEditor({ notify }: { notify: Notify }) {
  const { technologyList, courses } = useCatalog();
  const [editing, setEditing] = useState<Technology | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <Card
      title="Technologies"
      description="Engineers tag projects with these. Clients see the plain-language description and a “Learn this” link to the linked course. Saved immediately."
      action={
        <button onClick={() => setEditing(blankTech())} className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-600">
          <Plus className="size-4" /> Add technology
        </button>
      }
    >
      <ul className="grid gap-2.5 md:grid-cols-2">
        {technologyList.map((t) => {
          const course = courses[t.courseId];
          return (
            <motion.li key={t.id} layout className="flex items-start gap-3 rounded-xl border border-line p-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-navy font-display text-xs font-bold" style={{ color: t.color }}>
                {t.mark}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display font-semibold">
                  {t.name} <span className="text-xs font-normal text-muted">· {t.category}</span>
                </p>
                <p className="line-clamp-2 text-xs text-muted">{t.plain}</p>
                <p className={cn("mt-1 text-xs font-bold", course ? "text-teal-700" : "text-brand-700")}>{course ? `Course: ${course.title}` : "No course linked"}</p>
              </div>
              <div className="flex shrink-0 flex-col items-center">
                <IconButton label="Edit" onClick={() => setEditing(t)}>
                  <Pencil className="size-4" />
                </IconButton>
                {confirmDelete === t.id ? (
                  <button
                    onClick={() => {
                      deleteTechnology(t.id);
                      setConfirmDelete(null);
                      notify(`${t.name} deleted. It's hidden on projects that used it.`, "info");
                    }}
                    onBlur={() => setConfirmDelete(null)}
                    className="rounded-lg bg-danger px-2 py-1 text-[11px] font-bold text-white"
                  >
                    Delete?
                  </button>
                ) : (
                  <IconButton label="Delete" danger onClick={() => setConfirmDelete(t.id)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>

      <Drawer open={Boolean(editing)} title={editing?.id ? "Edit technology" : "New technology"} onClose={() => setEditing(null)}>
        {editing && (
          <TechForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={(tech) => {
              const isNew = !tech.id;
              let id = tech.id;
              if (isNew) {
                const base = slugify(tech.name);
                id = base;
                let n = 2;
                while (technologyList.some((x) => x.id === id)) id = `${base}-${n++}`;
              }
              saveTechnology({ ...tech, id });
              setEditing(null);
              notify(isNew ? `${tech.name} added.` : `${tech.name} saved.`);
            }}
          />
        )}
      </Drawer>
    </Card>
  );
}

function TechForm({ initial, onSave, onCancel }: { initial: Technology; onSave: (t: Technology) => void; onCancel: () => void }) {
  const { courseList } = useCatalog();
  const [t, setT] = useState<Technology>(initial);
  const [error, setError] = useState("");
  const set = (patch: Partial<Technology>) => setT((x) => ({ ...x, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (t.name.trim().length < 1) return setError("Enter the technology name.");
    if (t.plain.trim().length < 10) return setError("Add a plain-language description clients will understand.");
    onSave({ ...t, name: t.name.trim(), plain: t.plain.trim(), mark: (t.mark.trim() || t.name.trim().slice(0, 2)).slice(0, 3) });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Name" value={t.name} onChange={(v) => set({ name: v })} placeholder="e.g. Solidity" />
        <TextInput label="Category" value={t.category} onChange={(v) => set({ category: v })} placeholder="e.g. Web3" />
      </div>
      <TextArea label="Plain-language description" hint="Write for a first-time founder, e.g. “Where your app stores its data”." value={t.plain} onChange={(v) => set({ plain: v })} />
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-4">
        <TextInput label="Badge letters" value={t.mark} onChange={(v) => set({ mark: v.slice(0, 3) })} placeholder="So" maxLength={3} />
        <Field label="Badge colour" id="tech-color">
          <input id="tech-color" type="color" value={t.color} onChange={(e) => set({ color: e.target.value })} className="h-11 w-full cursor-pointer rounded-xl border border-line bg-white p-1" />
        </Field>
        <span className="mb-0.5 grid size-10 place-items-center rounded-lg bg-navy font-display text-xs font-bold" style={{ color: t.color }} aria-label="Badge preview">
          {t.mark || t.name.slice(0, 2)}
        </span>
      </div>
      <Field label="Linked course (“Learn this”)" id="tech-course">
        <select id="tech-course" value={t.courseId} onChange={(e) => set({ courseId: e.target.value })} className={cn(inputClass, "h-11")}>
          <option value="">No course</option>
          {courseList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
              {c.published ? "" : " (draft)"}
            </option>
          ))}
        </select>
      </Field>
      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger">{error}</p>}
      <FormActions onCancel={onCancel} />
    </form>
  );
}

/* ---------------- shared ---------------- */

function IconButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={cn("rounded-lg p-2 text-muted transition", danger ? "hover:bg-danger-soft hover:text-danger" : "hover:bg-mist hover:text-navy")}>
      {children}
    </button>
  );
}

function FormActions({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="sticky bottom-0 -mx-5 flex gap-2 border-t border-line bg-white px-5 pt-4 sm:-mx-6 sm:px-6">
      <button type="button" onClick={onCancel} className="h-11 flex-1 rounded-xl border border-line font-bold text-muted">
        Cancel
      </button>
      <button className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-navy font-bold text-white hover:bg-navy-700">
        <Save className="size-4" /> Save
      </button>
    </div>
  );
}

function Drawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-sm" onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
              <h2 className="font-display text-xl font-bold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted hover:bg-mist">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
