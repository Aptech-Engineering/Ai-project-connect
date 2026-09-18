"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BadgePercent, CalendarDays, CheckCircle2, Clock, ExternalLink, GraduationCap, Megaphone, MonitorSmartphone, X } from "lucide-react";
import StoredImage from "./StoredImage";
import { discountedPrice, formatPrice, useCatalog } from "@/lib/catalog";
import { SUBMIT_IDEA_HREF, useSiteContent } from "@/lib/content";
import { requestCourseEnquiry } from "@/lib/actions";
import { trackCourseView } from "@/lib/flows";
import { cn, formatDate } from "@/lib/format";
import type { Course } from "@/lib/types";
import type { Notify } from "./PortalApp";

/** Handles site links, including the special link that opens the idea form. */
export function SiteLink({
  href,
  onSubmitIdea,
  className,
  children,
  onClick,
}: {
  href: string;
  onSubmitIdea: () => void;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const external = /^https?:\/\//.test(href);
  return (
    <a
      href={href === SUBMIT_IDEA_HREF ? "#" : href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      onClick={(e) => {
        onClick?.();
        if (href === SUBMIT_IDEA_HREF) {
          e.preventDefault();
          onSubmitIdea();
        }
      }}
      className={className}
    >
      {children}
    </a>
  );
}

export function AnnouncementBar({ onSubmitIdea }: { onSubmitIdea: () => void }) {
  const { announcement } = useSiteContent();
  const [dismissed, setDismissed] = useState(false);
  const show = announcement.enabled && announcement.text.trim() && !dismissed;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: "auto" }}
          exit={{ height: 0 }}
          className="relative overflow-hidden bg-brand text-white"
        >
          <div className="container-page flex items-center justify-center gap-3 py-2 pr-10 text-center text-sm">
            <Megaphone className="hidden size-4 shrink-0 sm:block" />
            <span>{announcement.text}</span>
            {announcement.linkLabel && announcement.linkHref && (
              <SiteLink href={announcement.linkHref} onSubmitIdea={onSubmitIdea} className="shrink-0 font-bold underline underline-offset-2">
                {announcement.linkLabel}
              </SiteLink>
            )}
          </div>
          <button onClick={() => setDismissed(true)} aria-label="Dismiss announcement" className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-white/15">
            <X className="size-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function FliersSection({ onSubmitIdea }: { onSubmitIdea: () => void }) {
  const { fliers } = useSiteContent();
  const items = fliers.items.filter((f) => f.enabled);
  if (!fliers.enabled || items.length === 0) return null;
  return (
    <section id="offers" className="bg-white py-16 sm:py-20">
      <div className="container-page">
        <SectionHeading eyebrow="Offers" title={fliers.title} subtitle={fliers.subtitle} />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f, i) => (
            <motion.article
              key={f.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.08 }}
              className="group flex flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-navy/10"
            >
              {f.imageId ? (
                <StoredImage id={f.imageId} alt={f.title} className="aspect-[4/3] w-full object-cover" />
              ) : (
                <div className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-navy to-navy-700">
                  <Megaphone className="size-10 text-brand" />
                </div>
              )}
              <div className="flex flex-1 flex-col p-5">
                <h3 className="font-display text-lg font-bold">{f.title}</h3>
                {f.text && <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{f.text}</p>}
                {f.ctaLabel && f.ctaHref && (
                  <SiteLink
                    href={f.ctaHref}
                    onSubmitIdea={onSubmitIdea}
                    className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600"
                  >
                    {f.ctaLabel} <ArrowRight className="size-4" />
                  </SiteLink>
                )}
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CoursesSection({ notify }: { notify: Notify }) {
  const { courses: copy } = useSiteContent();
  const { courseList } = useCatalog();
  const list = courseList.filter((c) => c.published);
  const [enquire, setEnquire] = useState<{ course: Course; type: "info" | "enrol" } | null>(null);
  if (!copy.showOnHome || list.length === 0) return null;

  return (
    <section id="courses" className="scroll-mt-16 bg-mist py-16 sm:py-20">
      <div className="container-page">
        <SectionHeading eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.subtitle} />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c, i) => (
            <motion.article
              key={c.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              onViewportEnter={() => trackCourseView(c.id)}
              transition={{ delay: (i % 3) * 0.08 }}
              className="flex flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-navy/10"
            >
              {c.flierId ? (
                <StoredImage id={c.flierId} alt={`${c.title} flier`} className="aspect-[16/10] w-full object-cover" />
              ) : (
                <div className="relative grid aspect-[16/10] place-items-center overflow-hidden bg-navy">
                  <svg aria-hidden className="absolute -right-10 -top-10 size-48" viewBox="0 0 200 200" fill="none">
                    {[30, 55, 80].map((r) => (
                      <circle key={r} cx="100" cy="100" r={r} stroke="rgba(160,190,230,0.2)" />
                    ))}
                  </svg>
                  <GraduationCap className="relative size-10 text-brand" />
                </div>
              )}
              <div className="flex flex-1 flex-col p-5">
                <h3 className="font-display text-lg font-bold leading-snug">{c.title}</h3>
                {c.description && <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted">{c.description}</p>}
                <ul className="mt-4 grid grid-cols-2 gap-2 text-xs text-navy/80">
                  <li className="flex items-center gap-1.5">
                    <Clock className="size-3.5 text-brand" /> {c.duration}
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CalendarDays className="size-3.5 text-brand" /> Starts {formatDate(c.nextStart, { day: "numeric", month: "short" })}
                  </li>
                  <li className="col-span-2 flex items-center gap-1.5">
                    <MonitorSmartphone className="size-3.5 text-brand" /> {c.format}
                  </li>
                </ul>
                <div className="mt-4 flex flex-1 items-end justify-between gap-3 border-t border-line pt-4">
                  <div>
                    {c.discountPercent ? (
                      <>
                        <p className="text-xs text-muted line-through">{formatPrice(c.price, c.currency)}</p>
                        <p className="font-display text-xl font-bold">{formatPrice(discountedPrice(c), c.currency)}</p>
                        <p className="flex items-center gap-1 text-[11px] font-bold text-teal-700">
                          <BadgePercent className="size-3.5" /> {c.discountPercent}% off{c.discountCode ? ` · ${c.discountCode}` : ""}
                        </p>
                      </>
                    ) : (
                      <p className="font-display text-xl font-bold">{formatPrice(c.price, c.currency)}</p>
                    )}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button onClick={() => setEnquire({ course: c, type: "info" })} className="rounded-xl border border-line py-2.5 text-sm font-bold transition hover:border-navy">
                    {copy.enquiryButton}
                  </button>
                  {c.enrolUrl ? (
                    <a
                      href={c.enrolUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
                    >
                      {copy.enrolButton} <ExternalLink className="size-3.5" />
                    </a>
                  ) : (
                    <button onClick={() => setEnquire({ course: c, type: "enrol" })} className="rounded-xl bg-brand py-2.5 text-sm font-bold text-white transition hover:bg-brand-600">
                      {copy.enrolButton}
                    </button>
                  )}
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
      <EnquiryDialog request={enquire} onClose={() => setEnquire(null)} notify={notify} />
    </section>
  );
}

function EnquiryDialog({ request, onClose, notify }: { request: { course: Course; type: "info" | "enrol" } | null; onClose: () => void; notify: Notify }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [sent, setSent] = useState(false);
  const valid = name.trim().length > 1 && contact.trim().length > 5;

  const close = () => {
    onClose();
    window.setTimeout(() => {
      setSent(false);
      setName("");
      setContact("");
    }, 300);
  };

  return (
    <AnimatePresence>
      {request && (
        <motion.div className="fixed inset-0 z-[70] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-navy-950/70 backdrop-blur-sm" onClick={close} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="enquiry-title"
            initial={{ y: 30, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 20, scale: 0.97 }}
            className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
            <button onClick={close} aria-label="Close" className="absolute right-4 top-4 rounded-full p-1.5 text-muted hover:bg-mist">
              <X className="size-5" />
            </button>
            {sent ? (
              <div className="py-4 text-center">
                <CheckCircle2 className="mx-auto size-12 text-teal" />
                <p className="mt-3 font-display text-lg font-bold">Thanks, {name.split(" ")[0]}!</p>
                <p className="mt-1 text-sm text-muted">A course counsellor will contact you about {request.course.title}.</p>
                <button onClick={close} className="mt-5 h-11 w-full rounded-xl bg-navy font-bold text-white">
                  Done
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!valid) return;
                  requestCourseEnquiry(request.course.id, request.type, name.trim(), contact.trim());
                  setSent(true);
                  notify("Enquiry sent to our course counsellors.");
                }}
              >
                <p className="text-xs font-bold uppercase tracking-wider text-brand-700">{request.type === "enrol" ? "Enrol" : "Request info"}</p>
                <h3 id="enquiry-title" className="mt-1 pr-8 font-display text-xl font-bold">
                  {request.course.title}
                </h3>
                <label className="mt-5 block text-sm font-bold" htmlFor="enq-name">
                  Full name
                </label>
                <input id="enq-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="mt-1.5 h-11 w-full rounded-xl border border-line px-3.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
                <label className="mt-3 block text-sm font-bold" htmlFor="enq-contact">
                  Email or phone
                </label>
                <input id="enq-contact" value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="email" className="mt-1.5 h-11 w-full rounded-xl border border-line px-3.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
                <button disabled={!valid} className={cn("mt-5 h-12 w-full rounded-xl bg-brand font-bold text-white transition hover:bg-brand-600 disabled:opacity-40")}>
                  Send to a counsellor
                </button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">{eyebrow}</p>
      <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-3 text-muted">{subtitle}</p>}
    </motion.div>
  );
}
