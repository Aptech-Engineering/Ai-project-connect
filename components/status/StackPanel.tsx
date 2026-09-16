"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgePercent, CalendarDays, CheckCircle2, ChevronDown, Clock, GraduationCap, MonitorSmartphone, Wallet } from "lucide-react";
import { COURSES, TECHNOLOGIES } from "@/lib/data";
import { cn, formatDate } from "@/lib/format";
import type { Project } from "@/lib/types";
import type { Notify } from "../PortalApp";
import { requestCourse, setPromosOptOut } from "@/lib/actions";
import { useLeads } from "@/lib/store";

type LeadState = "info" | "enrol";

export default function StackPanel({ project, notify }: { project: Project; notify: Notify }) {
  const [open, setOpen] = useState<string | null>(null);
  const promos = !project.promosOptOut;
  const leads = Object.fromEntries(
    useLeads()
      .filter((l) => l.projectCode === project.code)
      .reverse()
      .map((l) => [l.techId, l.type]),
  ) as Record<string, LeadState>;

  const createLead = (techId: string, type: LeadState) => {
    const tech = TECHNOLOGIES[techId];
    requestCourse(project, techId, type);
    notify(
      type === "enrol"
        ? `Enrolment started for ${COURSES[tech.courseId].title}. A course counsellor will call you within 24 hours.`
        : `Request sent! A counsellor will share details about the ${tech.name} course.`,
    );
  };

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
        <h4 className="font-display text-lg font-bold">What your app is built with</h4>
        <p className="mt-1 text-sm text-white/60">The tools our engineers are using, explained simply.</p>

        {project.stack.length === 0 && (
          <p className="mt-5 rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/60">
            Your team is choosing the right tools. They&apos;ll appear here with simple explanations.
          </p>
        )}
        <ul className="mt-5 space-y-2.5">
          {project.stack.map(({ techId, usage }, i) => {
            const t = TECHNOLOGIES[techId];
            const course = COURSES[t.courseId];
            const isOpen = open === techId && promos;
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
                  {promos && (
                    <button
                      onClick={() => setOpen(isOpen ? null : techId)}
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
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="mx-3.5 mb-3.5 rounded-xl bg-white p-4 text-navy">
                        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-700">
                          <GraduationCap className="size-3.5" /> Aptech course
                        </p>
                        <p className="mt-1 font-display font-bold leading-snug">{course.title}</p>
                        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <Fact icon={<Clock className="size-3.5" />} label="Duration" value={course.duration} />
                          <Fact icon={<MonitorSmartphone className="size-3.5" />} label="Format" value={course.format} />
                          <Fact icon={<CalendarDays className="size-3.5" />} label="Next start" value={formatDate(course.nextStart)} />
                          <Fact icon={<Wallet className="size-3.5" />} label="Fee" value={course.fee} />
                        </dl>
                        <p className="mt-3 flex items-center gap-2 rounded-lg bg-teal-soft px-3 py-2 text-xs text-teal-700">
                          <BadgePercent className="size-4 shrink-0" />
                          <span>
                            Client discount: <b>10% off</b> with code <b className="font-mono">APC10</b>
                          </span>
                        </p>
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
          <span id="promo-label" className="text-white/70">Show course suggestions</span>
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
