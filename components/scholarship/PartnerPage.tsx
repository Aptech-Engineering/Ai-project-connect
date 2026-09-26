"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Loader2, MapPin } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import AptechMark from "../AptechMark";
import type { ScholarshipProgramme } from "@/lib/scholarship";
import { formatDay, money } from "./ScholarshipPage";

/**
 * A partner's landing page, hosted on our own domain:
 *   /scholarship/partner/<slug>
 *
 * Organisations that would rather not touch their own website just link here. The
 * page carries their logo and wording next to APTECH and AI Project Connect, and
 * "Register" goes to our own scholarship page with the partner remembered.
 */
export interface PartnerContent {
  slug: string;
  name: string;
  fullName: string;
  logo: string | null;
  accent: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  programmeTitle: string;
  tagline: string | null;
  intro: string | null;
  objectives: { title?: string; description?: string }[];
  tracks: { track?: string; focus?: string; target?: string }[];
  tracksNote: string;
  pathwaySteps: string[];
  pathwayIntro: string;
  pathwayDetails: { title?: string; description?: string }[];
  eligibility: { title?: string; description?: string }[];
  partnerWhy: string;
  aptechWhy: string;
  apcWhy: string;
}

/** The slug is the last part of the path, or ?p= when a host cannot rewrite. */
function slugFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const fromQuery = new URLSearchParams(window.location.search).get("p");
  if (fromQuery) return fromQuery;
  const parts = window.location.pathname.replace(/\/+$/, "").split("/");
  const last = parts[parts.length - 1];
  return last && last !== "partner" ? decodeURIComponent(last) : null;
}

export function PartnerPage() {
  const [state, setState] = useState<{ partner: PartnerContent; programme: ScholarshipProgramme } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const slug = slugFromLocation();
    if (!slug) {
      setError("This link is missing the partner name.");
      return;
    }
    api
      .get<{ partner: PartnerContent; programme: ScholarshipProgramme }>(`/scholarship/partners/${encodeURIComponent(slug)}`)
      .then(setState)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-mist px-4 text-center">
        <div>
          <p className="font-display text-lg font-bold text-navy">We couldn&rsquo;t find that page</p>
          <p className="mt-1 text-sm text-muted">{error}</p>
          <Link href="/scholarship" className="mt-5 inline-block rounded-xl bg-brand px-5 py-2.5 font-bold text-white">
            Open the scholarship programme
          </Link>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="grid min-h-screen place-items-center bg-navy-950" aria-busy="true">
        <Loader2 className="size-8 animate-spin text-brand" />
        <span className="sr-only">Loading…</span>
      </main>
    );
  }

  const { partner: p, programme } = state;
  const register = `/scholarship?partner=${encodeURIComponent(p.slug)}&utm_source=${encodeURIComponent(p.slug)}&utm_medium=partner&utm_campaign=scholarship`;
  const accent = /^#[0-9a-f]{6}$/i.test(p.accent) ? p.accent : "#0a7a3c";

  return (
    <main className="bg-mist" style={{ ["--partner" as string]: accent }}>
      {/* the three marks together */}
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="container-page flex flex-wrap items-center gap-3 py-2.5">
          {p.logo ? (
            <img src={p.logo} alt={p.name} className="h-10 w-auto" />
          ) : (
            <span className="font-display text-lg font-bold text-navy">{p.name}</span>
          )}
          <span className="h-8 w-px bg-line" />
          <AptechMark height="h-8" className="px-0" />
          <span className="h-8 w-px bg-line" />
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-brand font-display text-xs font-bold text-white">AI</span>
            <span className="text-sm font-bold leading-tight text-navy">
              AI Project Connect
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted">AI Projects LTD</span>
            </span>
          </Link>
          <Link href={register} className="ml-auto rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-600">
            Register
          </Link>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden bg-navy-950 py-14 text-white sm:py-16">
        <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden>
          <div className="absolute -left-28 -top-32 size-[26rem] rounded-full blur-3xl" style={{ background: accent, opacity: 0.45 }} />
          <div className="absolute -bottom-36 -right-24 size-[24rem] rounded-full bg-brand/40 blur-3xl" />
        </div>
        <div className="container-page relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider ring-1 ring-white/15">
            {p.name} × APTECH × AI Projects LTD
          </span>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-extrabold leading-tight sm:text-5xl">{p.programmeTitle}</h1>
          {p.tagline && <p className="mt-3 max-w-2xl font-semibold text-white/90">{p.tagline}</p>}
          {p.intro && <p className="mt-3 max-w-2xl text-white/70">{p.intro}</p>}

          <div className="mt-7 grid gap-3 sm:grid-cols-4">
            <Fact label="Scholarship form fee" value={money(programme.fee, programme.currency)} />
            <Fact label="Application deadline" value={formatDay(programme.deadline) ?? "Announced soon"} />
            <Fact
              label="Seats"
              value={programme.seats ? `${programme.seats} students` : "Open"}
              hint={programme.seatsLeft !== null && programme.seats ? `${programme.seatsLeft} left` : undefined}
            />
            <Fact label="Tuition" value="100% free" hint="on passing the exam" />
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {programme.open ? (
              <Link href={register} className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-6 font-bold text-white hover:bg-brand-600">
                Register for the scholarship <ArrowRight className="size-4" />
              </Link>
            ) : (
              <p className="rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold">{programme.closedMessage ?? "Applications are closed."}</p>
            )}
            <a href="#tracks" className="text-sm font-semibold text-white/70 underline-offset-4 hover:text-white hover:underline">
              See the course tracks
            </a>
          </div>
          <p className="mt-3 text-xs text-white/50">Registration, payment and exam scheduling are handled by AI Project Connect.</p>
        </div>
      </section>

      {p.objectives.length > 0 && (
        <Band kicker="Programme core objectives" title="What this programme sets out to do">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {p.objectives.map((o, i) => (
              <article key={i} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                <span
                  className="grid size-9 place-items-center rounded-xl text-sm font-bold"
                  style={{ background: `color-mix(in srgb, ${accent} 14%, #fff)`, color: accent }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 font-display font-bold text-navy">{o.title}</h3>
                <p className="mt-1 text-sm text-muted">{o.description}</p>
              </article>
            ))}
          </div>
        </Band>
      )}

      {p.tracks.length > 0 && (
        <Band id="tracks" tint kicker="Available short-term course tracks" title="Choose your track">
          <div className="table-scroll overflow-hidden rounded-2xl border border-line bg-white">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="bg-navy text-left text-[11px] uppercase tracking-wider text-white">
                  <th className="px-4 py-3 font-semibold">Course track</th>
                  <th className="px-4 py-3 font-semibold">Core focus areas</th>
                  <th className="px-4 py-3 font-semibold">Skill target</th>
                </tr>
              </thead>
              <tbody>
                {p.tracks.map((t, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-4 py-3 font-bold text-navy">{t.track}</td>
                    <td className="px-4 py-3 text-muted">{t.focus}</td>
                    <td className="px-4 py-3 text-muted">{t.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.tracksNote && <p className="mt-3 text-sm text-muted">{p.tracksNote}</p>}
        </Band>
      )}

      {p.pathwaySteps.length > 0 && (
        <Band kicker="Academic pathway" title="From a short course to a degree" sub={p.pathwayIntro}>
          <div className="flex flex-wrap items-stretch gap-2">
            {p.pathwaySteps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="rounded-xl border border-line bg-white px-4 py-3 shadow-sm" style={{ borderLeft: `4px solid ${accent}` }}>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">Stage {i + 1}</span>
                  <span className="font-display font-bold text-navy">{s}</span>
                </div>
                {i < p.pathwaySteps.length - 1 && <span style={{ color: accent }} className="font-bold">→</span>}
              </div>
            ))}
          </div>
          {p.pathwayDetails.length > 0 && (
            <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-muted">
              {p.pathwayDetails.map((d, i) => (
                <li key={i}>
                  <span className="font-bold text-navy">{d.title}:</span> {d.description}
                </li>
              ))}
            </ol>
          )}
        </Band>
      )}

      {p.eligibility.length > 0 && (
        <Band tint kicker="Eligibility & application" title="Who can apply, and how">
          <div className="grid gap-4 sm:grid-cols-3">
            {p.eligibility.map((e, i) => (
              <article key={i} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                <BadgeCheck className="size-5" style={{ color: accent }} />
                <h3 className="mt-2 font-display font-bold text-navy">{e.title}</h3>
                <p className="mt-1 text-sm text-muted">{e.description}</p>
              </article>
            ))}
          </div>
        </Band>
      )}

      <Band kicker="Institutional partners" title="Who is behind this">
        <div className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            {p.logo && <img src={p.logo} alt={p.name} className="mb-3 h-11 w-auto" />}
            <h3 className="font-display font-bold text-navy">{p.fullName}</h3>
            {p.partnerWhy && <p className="mt-1 text-sm text-muted">{p.partnerWhy}</p>}
          </article>
          <article className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <AptechMark height="h-11" className="mb-3 px-0" />
            <h3 className="font-display font-bold text-navy">APTECH Computer Education India</h3>
            <p className="mt-1 text-sm text-muted">
              {p.aptechWhy || "A global IT training institution with over 30 years of skill-based education across 40+ countries."}
            </p>
          </article>
          <article className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <span className="mb-3 grid size-8 place-items-center rounded-lg bg-brand font-display text-xs font-bold text-white">AI</span>
            <h3 className="font-display font-bold text-navy">AI Projects LTD</h3>
            <p className="mt-1 text-sm text-muted">
              {p.apcWhy || "Runs the application, payment and exam scheduling for the programme through AI Project Connect."}
            </p>
          </article>
        </div>
      </Band>

      <section className="bg-navy-950 py-14 text-center text-white">
        <div className="container-page">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Ready to apply?</h2>
          <p className="mx-auto mt-2 max-w-xl text-white/70">
            Places are limited
            {programme.seatsLeft !== null && programme.seats ? ` — ${programme.seatsLeft} of ${programme.seats} still open` : ""}. Registration closes on{" "}
            {formatDay(programme.deadline) ?? "the published deadline"}.
          </p>
          <Link href={register} className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-6 font-bold text-white hover:bg-brand-600">
            Register for the scholarship <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <footer className="bg-[#071426] py-8 text-sm text-white/65">
        <div className="container-page grid gap-6 sm:grid-cols-2">
          <div>
            <p className="font-bold text-white">{p.name}</p>
            {p.website && (
              <a href={p.website.startsWith("http") ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer" className="hover:text-white">
                {p.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            {p.email && (
              <a href={`mailto:${p.email}`} className="block hover:text-white">
                {p.email}
              </a>
            )}
            {p.phone && (
              <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="block hover:text-white">
                {p.phone}
              </a>
            )}
          </div>
          <div>
            <p className="font-bold text-white">The centre</p>
            <p className="flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              Aptech Centre
            </p>
          </div>
          <p className="border-t border-white/10 pt-4 text-xs text-white/45 sm:col-span-2">
            © {new Date().getFullYear()} {p.name} · APTECH Computer Education India · AI Projects LTD. Applications, payments and exam results are handled by AI
            Project Connect.
          </p>
        </div>
      </footer>
    </main>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      {hint && <p className="text-xs text-teal-200">{hint}</p>}
    </div>
  );
}

function Band({
  kicker,
  title,
  sub,
  tint,
  id,
  children,
}: {
  kicker: string;
  title: string;
  sub?: string;
  tint?: boolean;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={tint ? "bg-white py-14" : "py-14"}>
      <div className="container-page">
        <p className="text-xs font-bold uppercase tracking-wider text-brand-700">{kicker}</p>
        <h2 className="mt-1 font-display text-2xl font-bold text-navy sm:text-3xl">{title}</h2>
        {sub && <p className="mt-2 max-w-2xl text-muted">{sub}</p>}
        <div className="mt-7">{children}</div>
      </div>
    </section>
  );
}
