"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, BarChart3, Clock, GraduationCap, Mail, ReceiptText, Send, Star, TrendingUp } from "lucide-react";
import { STAGES, STALE_DAYS } from "@/lib/data";
import { buildDigest, overdueInfo, sendWeeklyDigests } from "@/lib/flows";
import { formatPrice, useCatalog } from "@/lib/catalog";
import { useIdeas } from "@/lib/ideas";
import { useCourseEvents, useLeads, useProjects } from "@/lib/store";
import { useStaff } from "@/lib/staff";
import { cn, daysFromNow, formatDate } from "@/lib/format";
import type { StageKey } from "@/lib/types";
import type { Notify } from "../PortalApp";
import { actingAs, daysSinceClientUpdate } from "./helpers";

const PERIODS = [30, 90, 365] as const;

/** Admin reports: projects by stage, overdue work, update frequency, course funnel, quotes (RP-01, LS-05). */
export default function Reports({ notify, onOpenProject }: { notify: Notify; onOpenProject: (code: string) => void }) {
  const me = useStaff();
  const projects = useProjects();
  const ideas = useIdeas();
  const leads = useLeads();
  const events = useCourseEvents();
  const { courseList } = useCatalog();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(90);
  const since = Date.now() - days * 86400_000;

  const active = projects.filter((p) => p.stage !== "DELIVERED");
  const overdue = projects.filter((p) => overdueInfo(p) > 0).sort((a, b) => overdueInfo(b) - overdueInfo(a));
  const overdueMilestones = active.flatMap((p) => p.milestones.filter((m) => !m.completedAt && daysFromNow(m.due) < 0).map((m) => ({ project: p, milestone: m, days: -daysFromNow(m.due) })));

  const frequency = active
    .map((p) => {
      const last30 = p.updates.filter((u) => (u.visibility ?? "client") === "client" && !u.pending && daysFromNow(u.date) >= -30).length;
      const since = daysSinceClientUpdate(p);
      return { project: p, last30, since: Number.isFinite(since) ? since : null, avgGap: last30 ? +(30 / last30).toFixed(1) : null };
    })
    .sort((a, b) => (b.since ?? 999) - (a.since ?? 999));
  const sinceValues = frequency.map((f) => f.since).filter((v): v is number => v !== null);
  const avgSince = sinceValues.length ? +(sinceValues.reduce((a, b) => a + b, 0) / sinceValues.length).toFixed(1) : null;

  const funnel = useMemo(() => {
    const rows = courseList.map((c) => {
      const ev = events.filter((e) => e.courseId === c.id && new Date(e.at).getTime() >= since);
      const ld = leads.filter((l) => l.courseId === c.id && new Date(l.at).getTime() >= since);
      return {
        course: c,
        views: ev.filter((e) => e.event === "view").length,
        clicks: ev.filter((e) => e.event === "click").length,
        leads: ld.length,
        enrolRequests: ld.filter((l) => l.type === "enrol").length,
        enrolled: ld.filter((l) => l.status === "ENROLLED").length,
        invites: ev.filter((e) => e.event === "invite").length,
      };
    });
    return rows.filter((r) => r.views + r.clicks + r.leads > 0).sort((a, b) => b.clicks + b.leads - (a.clicks + a.leads));
  }, [courseList, events, leads, since]);
  const totals = funnel.reduce((t, r) => ({ views: t.views + r.views, clicks: t.clicks + r.clicks, leads: t.leads + r.leads, enrolled: t.enrolled + r.enrolled }), { views: 0, clicks: 0, leads: 0, enrolled: 0 });

  const quotes = ideas.map((i) => i.quote).filter((q): q is NonNullable<typeof q> => Boolean(q) && new Date(q!.sentAt).getTime() >= since);
  const acceptedQuotes = quotes.filter((q) => q.status === "accepted");
  const acceptedValue = acceptedQuotes.reduce((sum, q) => sum + (q.currency === "NGN" ? q.amount : 0), 0);
  const ratings = projects.filter((p) => p.rating).map((p) => p.rating!.stars);
  const changes = projects.flatMap((p) => p.changeRequests ?? []);

  const byStage = (Object.keys(STAGES) as StageKey[]).map((stage) => ({ stage, label: STAGES[stage].label, count: projects.filter((p) => p.stage === stage).length }));

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Admin</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Reports</h1>
          <p className="mt-1 text-muted">How projects, updates, quotes and the course funnel are performing.</p>
        </div>
        <div className="flex rounded-xl border border-line bg-white p-1" role="radiogroup" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p} role="radio" aria-checked={days === p} onClick={() => setDays(p)} className={cn("rounded-lg px-3 py-1.5 text-sm font-bold transition", days === p ? "bg-navy text-white" : "text-muted hover:text-navy")}>
              {p === 365 ? "12 months" : `${p} days`}
            </button>
          ))}
        </div>
      </div>

      {/* headline tiles */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={<BarChart3 className="size-5" />} label="Active projects" value={String(active.length)} hint={`${projects.length - active.length} delivered · ${projects.filter((p) => p.stage === "ON_HOLD").length} on hold`} />
        <Tile icon={<AlertTriangle className="size-5" />} label="Overdue projects" value={String(overdue.length)} hint={`${overdueMilestones.length} overdue milestone${overdueMilestones.length === 1 ? "" : "s"}`} tone={overdue.length ? "danger" : undefined} />
        <Tile icon={<Clock className="size-5" />} label="Avg days since client update" value={avgSince === null ? "–" : String(avgSince)} hint={`Target: 3 days or less · ${frequency.filter((f) => f.since === null || f.since >= STALE_DAYS).length} stale`} tone={avgSince !== null && avgSince > 3 ? "brand" : undefined} />
        <Tile icon={<GraduationCap className="size-5" />} label="Course clicks → enrolled" value={`${totals.clicks ? Math.round((totals.enrolled / totals.clicks) * 100) : 0}%`} hint={`${totals.clicks} clicks · ${totals.leads} leads · ${totals.enrolled} enrolled`} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* projects by stage */}
        <Panel title="Projects by stage" subtitle={`${projects.length} projects in total`}>
          <BarList rows={byStage.map((s) => ({ key: s.stage, label: s.label, value: s.count }))} unit="project" />
        </Panel>

        {/* quotes & satisfaction */}
        <Panel title="Ideas, quotes and satisfaction" subtitle={`Last ${days === 365 ? "12 months" : `${days} days`}`}>
          <dl className="grid grid-cols-2 gap-3">
            <Metric icon={<ReceiptText className="size-4" />} label="Quotes sent" value={String(quotes.length)} />
            <Metric icon={<TrendingUp className="size-4" />} label="Accepted online" value={`${acceptedQuotes.length}${quotes.length ? ` (${Math.round((acceptedQuotes.length / quotes.length) * 100)}%)` : ""}`} />
            <Metric icon={<ReceiptText className="size-4" />} label="Accepted value" value={formatPrice(acceptedValue, "NGN")} />
            <Metric icon={<Star className="size-4" />} label="Average rating" value={ratings.length ? `${(ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)} / 5 (${ratings.length})` : "No ratings yet"} />
            <Metric icon={<AlertTriangle className="size-4" />} label="Open change requests" value={String(changes.filter((c) => ["SUBMITTED", "REVIEWING", "QUOTED"].includes(c.status)).length)} />
            <Metric
              icon={<ReceiptText className="size-4" />}
              label="Approved change value"
              value={formatPrice(changes.filter((c) => c.status === "APPROVED" || c.status === "COMPLETED").reduce((s, c) => s + (c.impactCost ?? 0), 0), "NGN")}
            />
          </dl>
        </Panel>
      </div>

      {/* update frequency */}
      <Panel className="mt-5" title="Update frequency" subtitle={`Client-visible updates per active project. Projects with no update in ${STALE_DAYS}+ days are flagged.`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <th className="py-2 pr-3 font-bold">Project</th>
                <th className="py-2 pr-3 font-bold">Stage</th>
                <th className="py-2 pr-3 text-right font-bold">Updates (30 days)</th>
                <th className="py-2 pr-3 text-right font-bold">Avg gap</th>
                <th className="py-2 text-right font-bold">Since last</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {frequency.map(({ project, last30, since, avgGap }) => {
                const stale = since === null || since >= STALE_DAYS;
                return (
                  <tr key={project.code} className="hover:bg-mist/60">
                    <td className="py-2.5 pr-3">
                      <button onClick={() => onOpenProject(project.code)} className="text-left font-bold hover:underline">
                        {project.title}
                      </button>
                      <span className="block font-mono text-[11px] text-muted">{project.code}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-muted">{STAGES[project.stage].label}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{last30}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{avgGap === null ? "–" : `${avgGap} days`}</td>
                    <td className={cn("py-2.5 text-right tabular-nums", stale ? "font-bold text-danger" : "")}>
                      {stale && <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" aria-label="Stale" />}
                      {since === null ? "Never" : `${since} days`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* overdue */}
        <Panel title="Overdue" subtitle="Past their target delivery date or milestone due date.">
          {overdue.length === 0 && overdueMilestones.length === 0 ? (
            <p className="rounded-xl bg-teal-soft px-4 py-3 text-sm text-teal-700">Nothing overdue. 🎉</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {overdue.map((p) => (
                <li key={p.code} className="flex items-center justify-between gap-3 py-2.5">
                  <button onClick={() => onOpenProject(p.code)} className="text-left">
                    <span className="block font-bold hover:underline">{p.title}</span>
                    <span className="block text-xs text-muted">
                      Delivery was {formatDate(p.targetDate)} · {p.lead.name}
                    </span>
                  </button>
                  <span className="shrink-0 rounded-full bg-danger-soft px-2.5 py-1 text-xs font-bold text-danger">{overdueInfo(p)} days late</span>
                </li>
              ))}
              {overdueMilestones.map(({ project, milestone, days: late }) => (
                <li key={project.code + milestone.id} className="flex items-center justify-between gap-3 py-2.5">
                  <button onClick={() => onOpenProject(project.code)} className="text-left">
                    <span className="block font-bold hover:underline">{milestone.title}</span>
                    <span className="block text-xs text-muted">
                      {project.title} · due {formatDate(milestone.due)}
                    </span>
                  </button>
                  <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-700">
                    {late} day{late === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* weekly digest */}
        <DigestCard notify={notify} actorName={me.name} actorRole={me.role} />
      </div>

      {/* course funnel */}
      <Panel className="mt-5" title="Course funnel" subtitle="Course card views on the website → “Learn this” clicks → info/enrol requests → enrolled (marked by counsellors).">
        {funnel.length === 0 ? (
          <p className="text-sm text-muted">No course activity in this period.</p>
        ) : (
          <>
            <BarList
              rows={[
                { key: "views", label: "Views", value: totals.views },
                { key: "clicks", label: "Clicks", value: totals.clicks },
                { key: "leads", label: "Leads", value: totals.leads },
                { key: "enrolled", label: "Enrolled", value: totals.enrolled },
              ]}
              unit="event"
            />
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                    <th className="py-2 pr-3 font-bold">Course</th>
                    <th className="py-2 pr-3 text-right font-bold">Views</th>
                    <th className="py-2 pr-3 text-right font-bold">Clicks</th>
                    <th className="py-2 pr-3 text-right font-bold">Leads</th>
                    <th className="py-2 pr-3 text-right font-bold">Enrol requests</th>
                    <th className="py-2 pr-3 text-right font-bold">Invites</th>
                    <th className="py-2 text-right font-bold">Enrolled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {funnel.map((r) => (
                    <tr key={r.course.id} className="hover:bg-mist/60">
                      <td className="py-2.5 pr-3 font-bold">{r.course.title}</td>
                      <td className="py-2.5 pr-3 text-right">{r.views}</td>
                      <td className="py-2.5 pr-3 text-right">{r.clicks}</td>
                      <td className="py-2.5 pr-3 text-right">{r.leads}</td>
                      <td className="py-2.5 pr-3 text-right">{r.enrolRequests}</td>
                      <td className="py-2.5 pr-3 text-right">{r.invites}</td>
                      <td className="py-2.5 text-right font-bold">{r.enrolled}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

function DigestCard({ notify, actorName, actorRole }: { notify: Notify; actorName: string; actorRole: string }) {
  const me = useStaff();
  const projects = useProjects();
  const active = projects.filter((p) => p.stage !== "DELIVERED");
  const [code, setCode] = useState(active[0]?.code ?? "");
  const project = active.find((p) => p.code === code);
  const digest = project ? buildDigest(project) : null;
  const optedOut = active.filter((p) => p.digestOptOut).length;

  return (
    <Panel title="Weekly progress emails" subtitle={`Sent every Monday by the server cron job. ${active.length - optedOut} clients will receive it${optedOut ? `, ${optedOut} turned it off` : ""}.`} action={<Mail className="size-5 text-brand" />}>
      <label className="block text-xs font-bold">
        Preview for
        <select value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal outline-none focus:border-brand">
          {active.map((p) => (
            <option key={p.code} value={p.code}>
              {p.title}
              {p.digestOptOut ? " (turned off)" : ""}
            </option>
          ))}
        </select>
      </label>
      {digest && (
        <div className="mt-3 rounded-xl bg-mist p-3">
          <p className="text-sm font-bold">{digest.subject}</p>
          <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-navy/80">{digest.body}</pre>
        </div>
      )}
      <button
        onClick={() => {
          const result = sendWeeklyDigests(actingAs(me));
          notify(`Weekly emails sent to ${result.sent} client${result.sent === 1 ? "" : "s"} (${result.skipped} skipped).`);
        }}
        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-navy text-sm font-bold text-white hover:bg-navy-700"
        title={`Send as ${actorName} (${actorRole})`}
      >
        <Send className="size-4" /> Send this week&apos;s emails now
      </button>
    </Panel>
  );
}

/* ---------------- building blocks ---------------- */

function Panel({ title, subtitle, children, className, action }: { title: string; subtitle?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={cn("rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </motion.section>
  );
}

function Tile({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string; hint: string; tone?: "danger" | "brand" }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
      <span className={cn("grid size-10 place-items-center rounded-xl", tone === "danger" ? "bg-danger-soft text-danger" : tone === "brand" ? "bg-brand text-white" : "bg-brand-soft text-brand-700")}>{icon}</span>
      <p className="mt-3 font-display text-2xl font-bold tabular-nums sm:text-3xl">{value}</p>
      <p className="text-sm font-bold">{label}</p>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-mist px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        {icon} {label}
      </dt>
      <dd className="mt-0.5 font-display font-bold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Single-series horizontal bars: one hue (navy), rounded data-end, value label beside each bar,
 * hover highlight + native tooltip. Labels and values stay in text colours, never the bar colour.
 */
function BarList({ rows, unit }: { rows: { key: string; label: string; value: number }[]; unit: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1.5" role="list">
      {rows.map((r, i) => (
        <li
          key={r.key}
          className="grid grid-cols-[110px_1fr_40px] items-center gap-3 rounded-lg px-1 py-1"
          onMouseEnter={() => setHover(r.key)}
          onMouseLeave={() => setHover(null)}
          title={`${r.label}: ${r.value} ${unit}${r.value === 1 ? "" : "s"}`}
        >
          <span className={cn("truncate text-xs", hover === r.key ? "font-bold text-navy" : "text-muted")}>{r.label}</span>
          <span className="relative h-5 rounded-r-[4px] bg-mist">
            <motion.span
              className={cn("absolute inset-y-0 left-0 rounded-r-[4px] transition-colors", hover && hover !== r.key ? "bg-navy/35" : "bg-navy")}
              initial={{ width: 0 }}
              animate={{ width: `${(r.value / max) * 100}%` }}
              transition={{ delay: i * 0.04, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          </span>
          <span className="text-right text-xs font-bold tabular-nums text-navy">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

