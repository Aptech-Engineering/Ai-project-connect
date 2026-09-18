"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgePercent, CalendarDays, CheckCircle2, ChevronDown, Clock, ExternalLink, GraduationCap, MonitorSmartphone, UserPlus, Wallet } from "lucide-react";
import StoredImage from "../StoredImage";
import { discountedPrice, formatPrice, useCatalog } from "@/lib/catalog";
import { useSiteContent } from "@/lib/content";
import { cn, formatDate } from "@/lib/format";
import type { Project } from "@/lib/types";
import type { Notify } from "../PortalApp";
import { requestCourse, setPromosOptOut } from "@/lib/actions";
import { inviteToCourse, trackCourseClick } from "@/lib/flows";
import { useLeads } from "@/lib/store";

type LeadState = "info" | "enrol";

export default function StackPanel({ project, notify }: { project: Project; notify: Notify }) {
  const [open, setOpen] = useState<string | null>(null);
  const { courses, technologies } = useCatalog();
  const { portal } = useSiteContent();
  const promos = !project.promosOptOut;
  const leads = Object.fromEntries(
    useLeads()
      .filter((l) => l.projectCode === project.code)
      .reverse()
      .map((l) => [l.techId, l.type]),
  ) as Record<string, LeadState>;

  const createLead = (techId: string, type: LeadState) => {
    const tech = technologies[techId];
    const course = tech ? courses[tech.courseId] : undefined;
    if (!tech || !course) return;
    requestCourse(project, techId, type);
    notify(type === "enrol" ? `Enrolment started for ${course.title}. ${portal.counsellorPromise}` : `Request sent! A counsellor will share details about the ${tech.name} course.`);
  };

  const stack = project.stack.filter((s) => technologies[s.techId]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="relative overflow-hidden rounded-3xl bg-navy p-5 text-white shadow-xl shadow-navy/20 sm:p-6"
    >
      <svg className="pointer-events-none absolute -right-24 -top-24 size-72 opacity-60" viewBox="0 0 300 300" fill="none" aria-hidden>
        {[40, 70, 100, 130].map((r) => (
          <circle key={r} cx="150" cy="150" r={r} stroke="rgba(160,190,230,0.15)" />
        ))}
      </svg>

      <div className="relative">
        <h4 className="font-display text-lg font-bold">{portal.stackTitle}</h4>
        <p className="mt-1 text-sm text-white/60">{portal.stackSubtitle}</p>

        {stack.length === 0 && (
          <p className="mt-5 rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/60">
            Your team is choosing the right tools. They&apos;ll appear here with simple explanations.
          </p>
        )}
        <ul className="mt-5 space-y-2.5">
          {stack.map(({ techId, usage }, i) => {
            const t = technologies[techId]!;
            const course = courses[t.courseId];
            const hasCourse = Boolean(course?.published);
            const isOpen = open === techId && promos && hasCourse;
            const lead = leads[techId];
            return (
              <motion.li
                key={techId}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.08 }}
                className={cn(
                  "rounded-2xl border transition-colors",
                  isOpen ? "border-brand/40 bg-white/[0.07]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
                )}
              >
                <div className="flex items-start gap-3 p-3.5">
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy-700 font-display text-xs font-bold ring-1 ring-white/10"
                    style={{ color: t.color }}
                  >
                    {t.mark}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-display font-semibold">{t.name}</span>
                      <span className="text-xs text-white/50">{usage}</span>
                    </div>
                    <p className="mt-0.5 text-[13px] leading-snug text-white/70">{t.plain}</p>
                  </div>
                  {promos && hasCourse && (
                    <button
                      onClick={() => {
                        if (!isOpen && course) trackCourseClick(course.id, techId, project.code);
                        setOpen(isOpen ? null : techId);
                      }}
                      aria-expanded={isOpen}
                      className={cn(
                        "flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition",
                        isOpen ? "bg-white text-navy" : "bg-brand text-white hover:bg-brand-600",
                      )}
                    >
                      {lead ? <CheckCircle2 className="size-3.5" /> : null}
                      Learn this
                      <ChevronDown className={cn("size-3.5 transition", isOpen && "rotate-180")} />
                    </button>
                  )}
                </div>

                {/* Course card: expands inline, never blocks status info (LS-06) */}
                <AnimatePresence initial={false}>
                  {isOpen && course && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="mx-3.5 mb-3.5 overflow-hidden rounded-xl bg-white text-navy">
                        <StoredImage id={course.flierId} alt={`${course.title} flier`} className="max-h-56 w-full object-cover" />
                        <div className="p-4">
                          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-700">
                            <GraduationCap className="size-3.5" /> Aptech course
                          </p>
                          <p className="mt-1 font-display font-bold leading-snug">{course.title}</p>
                          {course.description && <p className="mt-1 text-xs leading-relaxed text-muted">{course.description}</p>}
                          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <Fact icon={<Clock className="size-3.5" />} label="Duration" value={course.duration} />
                            <Fact icon={<MonitorSmartphone className="size-3.5" />} label="Format" value={course.format} />
                            <Fact icon={<CalendarDays className="size-3.5" />} label="Next start" value={formatDate(course.nextStart)} />
                            <Fact icon={<Wallet className="size-3.5" />} label="Fee" value={formatPrice(course.price, course.currency)} />
                          </dl>
                          {course.discountPercent ? (
                            <p className="mt-3 flex items-center gap-2 rounded-lg bg-teal-soft px-3 py-2 text-xs text-teal-700">
                              <BadgePercent className="size-4 shrink-0" />
                              <span>
                                {portal.discountLabel}: <b>{course.discountPercent}% off</b>
                                {course.discountCode && (
                                  <>
                                    {" "}
                                    with code <b className="font-mono">{course.discountCode}</b>
                                  </>
                                )}{" "}
                                · you pay <b>{formatPrice(discountedPrice(course), course.currency)}</b>
                              </span>
                            </p>
                          ) : null}
                          {lead ? (
                            <motion.p
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="mt-3 flex items-center gap-2 rounded-lg bg-mist px-3 py-2.5 text-sm font-bold"
                            >
                              <CheckCircle2 className="size-4 text-teal" />
                              {lead === "enrol" ? "Enrolment started. We'll call you soon." : "Info requested. We'll be in touch."}
                            </motion.p>
                          ) : (
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <button
                                onClick={() => createLead(techId, "info")}
                                className="rounded-xl border border-line py-2.5 text-sm font-bold transition hover:border-navy"
                              >
                                Request info
                              </button>
                              <button
                                onClick={() => createLead(techId, "enrol")}
                                className="rounded-xl bg-brand py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
                              >
                                Enrol
                              </button>
                            </div>
                          )}
                          <InviteTeamMember project={project} techId={techId} courseTitle={course.title} notify={notify} />
                          {course.enrolUrl && (
                            <a
                              href={course.enrolUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 flex items-center justify-center gap-1 text-xs font-bold text-brand-700 hover:underline"
                            >
                              Pay and enrol online <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </ul>

        {/* Marketing consent: opt out without losing status access */}
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-sm">
          <span id="promo-label" className="text-white/70">
            Show course suggestions
          </span>
          <button
            role="switch"
            aria-checked={promos}
            aria-labelledby="promo-label"
            onClick={() => {
              setPromosOptOut(project, promos);
              notify(promos ? "Course suggestions hidden. You can turn them back on anytime." : "Course suggestions are back on.", "info");
            }}
            className={cn("relative h-6 w-11 rounded-full transition", promos ? "bg-teal" : "bg-white/20")}
          >
            <motion.span
              layout
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className={cn("absolute top-1 size-4 rounded-full bg-white shadow", promos ? "right-1" : "left-1")}
            />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-mist px-2.5 py-2">
      <dt className="flex items-center gap-1 text-muted">
        {icon} {label}
      </dt>
      <dd className="mt-0.5 font-bold">{value}</dd>
    </div>
  );
}

function InviteTeamMember({ project, techId, courseTitle, notify }: { project: Project; techId: string; courseTitle: string; notify: Notify }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const valid = name.trim().length > 1 && /^\S+@\S+\.\S+$/.test(email.trim());

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-muted transition hover:bg-mist hover:text-navy">
        <UserPlus className="size-3.5" /> Invite a team member to this course
      </button>
    );
  }
  return (
    <form
      className="mt-3 space-y-2 rounded-xl bg-mist p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        const problem = inviteToCourse(project, techId, name.trim(), email.trim(), message.trim() || undefined);
        if (problem) return setError(problem);
        notify(`Invitation sent to ${name.trim()} for ${courseTitle}.`);
        setOpen(false);
        setName("");
        setEmail("");
        setMessage("");
      }}
    >
      <p className="text-xs font-bold">Invite someone from your team</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" aria-label="Their name" className="h-9 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-brand" />
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email" aria-label="Their email" className="h-9 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-brand" />
      <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Short message (optional)" aria-label="Message" className="h-9 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-brand" />
      {error && <p className="text-xs font-bold text-danger">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border border-line bg-white text-xs font-bold text-muted">
          Cancel
        </button>
        <button disabled={!valid} className="h-9 rounded-lg bg-navy text-xs font-bold text-white disabled:opacity-40">
          Send invite
        </button>
      </div>
    </form>
  );
}
