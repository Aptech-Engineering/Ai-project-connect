"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BadgeCheck, CalendarDays, CheckCircle2, GraduationCap, Loader2, MapPin, Phone, Ticket, Users } from "lucide-react";
import { useScholarship, type ScholarshipProgramme } from "@/lib/scholarship";
import { cn } from "@/lib/format";
import AptechMark from "../AptechMark";
import { RegisterDialog } from "./RegisterDialog";

/** Formats 27000 as ₦27,000 — the fee is always whole naira. */
export function money(amount: number, currency = "NGN") {
  const symbol = currency === "NGN" ? "₦" : `${currency} `;
  return symbol + new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(amount);
}

export function formatDay(iso: string | null) {
  if (!iso) return null;
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function ScholarshipPage() {
  const { programme, loading, error, refresh } = useScholarship();
  const [registering, setRegistering] = useState(false);

  if (loading && !programme) {
    return (
      <main className="grid min-h-screen place-items-center bg-navy-950" aria-busy="true">
        <Loader2 className="size-8 animate-spin text-brand" />
        <span className="sr-only">Loading the scholarship programme…</span>
      </main>
    );
  }

  if (!programme) {
    return (
      <main className="grid min-h-screen place-items-center bg-navy-950 px-4 text-center">
        <div>
          <p className="font-display text-lg font-bold text-white">We couldn&rsquo;t load this page</p>
          <p className="mt-1 text-sm text-white/70">{error}</p>
          <button onClick={() => void refresh()} className="mt-4 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white">
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-mist">
      <Hero programme={programme} onRegister={() => setRegistering(true)} />
      <Courses programme={programme} />
      <Benefits programme={programme} />
      <Steps programme={programme} onRegister={() => setRegistering(true)} />
      <Contact programme={programme} />
      <AnimatePresence>{registering && <RegisterDialog programme={programme} onClose={() => setRegistering(false)} />}</AnimatePresence>
    </main>
  );
}

function Hero({ programme, onRegister }: { programme: ScholarshipProgramme; onRegister: () => void }) {
  const deadline = formatDay(programme.deadline);
  return (
    <section className="relative overflow-hidden bg-navy-950 pb-16 pt-14 text-white sm:pb-20 sm:pt-20">
      {/* The flier's green-and-white feel, without shouting over the app's own brand. */}
      <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden>
        <div className="absolute -left-24 top-0 size-[28rem] rounded-full bg-teal/20 blur-3xl" />
        <div className="absolute -right-24 bottom-0 size-[26rem] rounded-full bg-brand/20 blur-3xl" />
      </div>
      <div className="container-page relative">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-white/70 transition hover:text-white">
            <span className="grid size-7 place-items-center rounded-lg bg-brand font-display text-xs font-bold">AI</span>
            AI Project Connect
          </Link>
          <span className="h-6 w-px bg-white/20" aria-hidden />
          <AptechMark height="h-7" />
        </div>

        <span className="mt-8 inline-flex items-center gap-2 rounded-full bg-teal/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-teal-200 ring-1 ring-teal/30">
          <GraduationCap className="size-3.5" /> Learn · Grow · Build your future
        </span>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">{programme.title}</h1>
        {programme.intro && <p className="mt-4 max-w-2xl text-base text-white/75 sm:text-lg">{programme.intro}</p>}

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Fact icon={<Ticket className="size-5" />} label="Scholarship form fee" value={money(programme.fee, programme.currency)} />
          <Fact icon={<CalendarDays className="size-5" />} label="Deadline" value={deadline ?? "Announced soon"} />
          <Fact
            icon={<Users className="size-5" />}
            label="Seats"
            value={programme.seats ? `${programme.seats} students` : "Open"}
            hint={programme.seatsLeft !== null && programme.seats ? `${programme.seatsLeft} left` : undefined}
          />
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {programme.open ? (
            <button
              onClick={onRegister}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-6 font-bold text-white transition hover:bg-brand-600"
            >
              Apply now <ArrowRight className="size-4" />
            </button>
          ) : (
            <p className="rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white">
              {programme.closedMessage ?? "Applications are closed for now."}
            </p>
          )}
          <a href="#how-it-works" className="text-sm font-semibold text-white/75 underline-offset-4 hover:text-white hover:underline">
            How it works
          </a>
        </div>
        <p className="mt-3 text-xs text-white/50">Pass the entrance exam and study 100% tuition free.</p>
      </div>
    </section>
  );
}

function Fact({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/50">
        <span className="text-teal-200">{icon}</span>
        {label}
      </div>
      <p className="mt-1.5 font-display text-2xl font-bold">{value}</p>
      {hint && <p className="text-xs text-teal-200">{hint}</p>}
    </div>
  );
}

function Courses({ programme }: { programme: ScholarshipProgramme }) {
  if (programme.courses.length === 0) return null;
  return (
    <section className="container-page py-14 sm:py-20">
      <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Short-term courses available</p>
      <h2 className="mt-1 font-display text-3xl font-bold text-navy sm:text-4xl">Choose what you want to learn</h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {programme.courses.map((c, i) => (
          <motion.article
            key={c.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ delay: Math.min(i * 0.05, 0.3) }}
            className="rounded-2xl border border-line bg-white p-5 shadow-sm"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-teal-soft text-teal-700">
              <GraduationCap className="size-5" />
            </span>
            <h3 className="mt-3 font-display text-lg font-bold text-navy">{c.title}</h3>
            {c.description && <p className="mt-1 text-sm text-muted">{c.description}</p>}
          </motion.article>
        ))}
      </div>
    </section>
  );
}

function Benefits({ programme }: { programme: ScholarshipProgramme }) {
  if (programme.benefits.length === 0) return null;
  return (
    <section className="bg-white py-14 sm:py-20">
      <div className="container-page">
        <h2 className="font-display text-3xl font-bold text-navy sm:text-4xl">Why join this programme?</h2>
        <dl className="mt-8 grid gap-5 sm:grid-cols-2">
          {programme.benefits.map((b) => (
            <div key={b.title} className="flex gap-3">
              <BadgeCheck className="mt-0.5 size-5 shrink-0 text-teal" />
              <div>
                <dt className="font-display font-bold text-navy">{b.title}</dt>
                {b.description && <dd className="mt-0.5 text-sm text-muted">{b.description}</dd>}
              </div>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Steps({ programme, onRegister }: { programme: ScholarshipProgramme; onRegister: () => void }) {
  if (programme.steps.length === 0) return null;
  return (
    <section id="how-it-works" className="container-page py-14 sm:py-20">
      <h2 className="font-display text-3xl font-bold text-navy sm:text-4xl">How it works</h2>
      <ol className="mt-8 grid gap-4 sm:grid-cols-3">
        {programme.steps.map((s, i) => (
          <li key={s.title} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <span className="grid size-9 place-items-center rounded-full bg-navy font-display text-sm font-bold text-white">{i + 1}</span>
            <h3 className="mt-3 font-display text-lg font-bold text-navy">{s.title}</h3>
            {s.description && <p className="mt-1 text-sm text-muted">{s.description}</p>}
          </li>
        ))}
      </ol>

      {programme.examDates.length > 0 && (
        <div className="mt-8 rounded-2xl border border-line bg-white p-5 shadow-sm">
          <h3 className="font-display font-bold text-navy">Exam dates</h3>
          <p className="text-sm text-muted">You are placed in one of these after your fee is confirmed.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {programme.examDates.map((b) => (
              <li key={b.name} className="rounded-xl bg-mist px-3 py-2 text-sm">
                <span className="font-bold text-navy">{b.name}</span>
                <span className="text-muted"> · {formatDay(b.examDate) ?? "date to be confirmed"}{b.examTime ? `, ${b.examTime}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {programme.open && (
        <button onClick={onRegister} className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-6 font-bold text-white transition hover:bg-brand-600">
          Apply now <ArrowRight className="size-4" />
        </button>
      )}
    </section>
  );
}

function Contact({ programme }: { programme: ScholarshipProgramme }) {
  const { address, organisers, phones = [] } = programme.contact ?? {};
  if (!address && !organisers && phones.length === 0) return null;
  return (
    <section className="bg-navy-950 py-14 text-white sm:py-16">
      <div className="container-page grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl font-bold">Contact &amp; location</h2>
          {address && (
            <p className="mt-3 flex gap-2 text-sm text-white/75">
              <MapPin className="mt-0.5 size-4 shrink-0 text-teal-200" /> {address}
            </p>
          )}
          {organisers && <p className="mt-2 text-sm text-white/50">{organisers}</p>}
        </div>
        {phones.length > 0 && (
          <div>
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-white/50">For enquiries</h3>
            <ul className="mt-3 space-y-1.5">
              {phones.map((p) => (
                <li key={p}>
                  <a href={`tel:${p.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-2 font-semibold hover:text-brand">
                    <Phone className="size-4 text-teal-200" /> {p}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/** Shared by the dialog and the status page. */
export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    PENDING: { label: "Fee not paid yet", className: "bg-mist text-muted", icon: <Ticket className="size-3.5" /> },
    AWAITING_CONFIRMATION: { label: "Checking your transfer", className: "bg-blue-soft text-blue-700", icon: <Loader2 className="size-3.5" /> },
    PAID: { label: "Fee confirmed", className: "bg-teal-soft text-teal-700", icon: <CheckCircle2 className="size-3.5" /> },
    FAILED: { label: "Payment failed", className: "bg-danger-soft text-danger", icon: <Ticket className="size-3.5" /> },
  };
  const s = map[status] ?? map.PENDING;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold", s.className)}>
      {s.icon} {s.label}
    </span>
  );
}
