"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, BarChart3, Clock, GraduationCap, Loader2, Mail, ReceiptText, Send, Star, TrendingUp } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatPrice } from "@/lib/catalog";
import { previewDigest, sendWeeklyDigests, type DigestPreview } from "@/lib/flows";
import { useReports, useStaffProjects } from "@/lib/store";
import { cn, formatDate } from "@/lib/format";
import type { Notify } from "../PortalApp";

const PERIODS = [30, 90, 365] as const;
type Period = (typeof PERIODS)[number];

/* ---------------- what /admin/reports sends ---------------- */

interface StageCount {
  stage: string;
  label: string;
  count: number;
}

interface OverdueProject {
  code: string;
  title: string;
  lead: string | null;
  stage: string;
  targetDate: string;
  daysOverdue: number;
}

interface OverdueMilestone {
  code: string;
  project: string;
  milestone: string;
  due: string;
  daysOverdue: number;
}

interface UpdateFrequency {
  code: string;
  title: string;
  stage: string;
  updatesLast30Days: number;
  avgDaysBetweenUpdates: number | null;
  daysSinceLastUpdate: number | null;
  stale: boolean;
}

interface CourseFunnelRow {
  courseId: string;
  title: string;
  views: number;
  clicks: number;
  leads: number;
  enrolRequests: number;
  enrolled: number;
  invites: number;
}

interface ReportData {
  periodDays: number;
  projects: {
    total: number;
    active: number;
    delivered: number;
    onHold: number;
    byStage: StageCount[];
    overdue: OverdueProject[];
    overdueMilestones: OverdueMilestone[];
  };
  updates: {
    avgDaysSinceLastUpdate: number | null;
    staleProjects: number;
    perProject: UpdateFrequency[];
  };
  courses: {
    totals: { views: number; clicks: number; leads: number; enrolRequests: number; enrolled: number; invites: number; conversionPercent: number };
    byCourse: CourseFunnelRow[];
  };
  ideas: { submitted: number; quoted: number; accepted: number; declined: number; quotesSent: number; quotesAccepted: number; acceptedValue: number };
  changeRequests: { open: number; approved: number; approvedCost: number };
  satisfaction: { averageRating: number | null; ratings: number };
}

const periodLabel = (days: number) => (days === 365 ? "12 months" : `${days} days`);

/** Admin reports (RP-01, LS-05). Every number here is counted by the server. */
export default function Reports({ notify, onOpenProject }: { notify: Notify; onOpenProject: (code: string) => void }) {
  const [days, setDays] = useState<Period>(90);
  const { data, loading, error, refresh } = useReports(days);
  const report = data as ReportData | undefined;

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Admin</p>
        <h1 className="mt-1 font-display text-3xl font-bold">Reports</h1>
        <p className="mt-1 text-muted">How projects, updates, quotes and the course funnel are performing.</p>
      </div>
      <div className="flex rounded-xl border border-line bg-white p-1" role="radiogroup" aria-label="Period">
        {PERIODS.map((p) => (
          <button key={p} role="radio" aria-checked={days === p} onClick={() => setDays(p)} className={cn("rounded-lg px-3 py-1.5 text-sm font-bold transition", days === p ? "bg-navy text-white" : "text-muted hover:text-navy")}>
            {periodLabel(p)}
          </button>
        ))}
      </div>
    </div>
  );

  if (!report) {
    return (
      <div>
        {header}
        {loading ? (
          <div className="mt-6" role="status" aria-live="polite">
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-4 animate-spin text-brand" /> Working out the numbers…
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-32 animate-pulse rounded-2xl border border-line bg-white" />
              ))}
            </div>
            <div className="mt-5 h-64 animate-pulse rounded-2xl border border-line bg-white" aria-hidden />
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-line bg-white p-6 text-center" role="alert">
            <AlertTriangle className="mx-auto size-8 text-danger" />
            <p className="mt-3 font-bold">We couldn&apos;t load the reports.</p>
            <p className="mt-1 text-sm text-muted">{error ?? "Please try again."}</p>
            <button onClick={() => void refresh()} className="mt-4 h-11 rounded-xl bg-navy px-5 font-bold text-white hover:bg-navy-700">
              Try again
            </button>
          </div>
        )}
      </div>
    );
  }

  const { projects, updates, courses, ideas, changeRequests, satisfaction } = report;
  const funnel = courses.byCourse;
  const totals = courses.totals;
  const period = periodLabel(report.periodDays);

  return (
    <div>
      {header}

      {error && (
        <p className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          <AlertTriangle className="size-4 shrink-0" /> {error}
          <button onClick={() => void refresh()} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-navy shadow-sm">
            Try again
          </button>
        </p>
      )}

      {/* headline tiles */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={<BarChart3 className="size-5" />} label="Active projects" value={String(projects.active)} hint={`${projects.delivered} delivered · ${projects.onHold} on hold`} />
        <Tile
          icon={<AlertTriangle className="size-5" />}
          label="Overdue projects"
          value={String(projects.overdue.length)}
          hint={`${projects.overdueMilestones.length} overdue milestone${projects.overdueMilestones.length === 1 ? "" : "s"}`}
          tone={projects.overdue.length ? "danger" : undefined}
        />
        <Tile
          icon={<Clock className="size-5" />}
          label="Avg days since client update"
          value={updates.avgDaysSinceLastUpdate === null ? "–" : String(updates.avgDaysSinceLastUpdate)}
          hint={`Target: 3 days or less · ${updates.staleProjects} stale`}
          tone={updates.avgDaysSinceLastUpdate !== null && updates.avgDaysSinceLastUpdate > 3 ? "brand" : undefined}
        />
        <Tile
          icon={<GraduationCap className="size-5" />}
          label="Course clicks → enrolled"
          value={`${totals.conversionPercent}%`}
          hint={`${totals.clicks} clicks · ${totals.leads} leads · ${totals.enrolled} enrolled`}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Projects by stage" subtitle={`${projects.total} project${projects.total === 1 ? "" : "s"} in total`}>
          <BarList rows={projects.byStage.map((s) => ({ key: s.stage, label: s.label, value: s.count }))} unit="project" />
        </Panel>

        <Panel title="Ideas, quotes and satisfaction" subtitle={`Last ${period}`}>
          <dl className="grid grid-cols-2 gap-3">
            <Metric icon={<ReceiptText className="size-4" />} label="Ideas submitted" value={String(ideas.submitted)} />
            <Metric icon={<ReceiptText className="size-4" />} label="Quotes sent" value={String(ideas.quotesSent)} />
            <Metric
              icon={<TrendingUp className="size-4" />}
              label="Accepted online"
              value={`${ideas.quotesAccepted}${ideas.quotesSent ? ` (${Math.round((ideas.quotesAccepted / ideas.quotesSent) * 100)}%)` : ""}`}
            />
            <Metric icon={<ReceiptText className="size-4" />} label="Accepted value" value={formatPrice(ideas.acceptedValue, "NGN")} />
            <Metric
              icon={<Star className="size-4" />}
              label="Average rating"
              value={satisfaction.averageRating === null ? "No ratings yet" : `${satisfaction.averageRating} / 5 (${satisfaction.ratings})`}
            />
            <Metric icon={<AlertTriangle className="size-4" />} label="Open change requests" value={String(changeRequests.open)} />
            <Metric icon={<ReceiptText className="size-4" />} label="Approved change value" value={formatPrice(changeRequests.approvedCost, "NGN")} />
            <Metric icon={<ReceiptText className="size-4" />} label="Ideas declined" value={String(ideas.declined)} />
          </dl>
        </Panel>
      </div>

      {/* update frequency */}
      <Panel className="mt-5" title="Update frequency" subtitle="Client-visible updates per active project. Projects the server marks as stale are flagged.">
        {updates.perProject.length === 0 ? (
          <p className="text-sm text-muted">No active projects to measure.</p>
        ) : (
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
                {updates.perProject.map((row) => (
                  <tr key={row.code} className="hover:bg-mist/60">
                    <td className="py-2.5 pr-3">
                      <button onClick={() => onOpenProject(row.code)} className="text-left font-bold hover:underline">
                        {row.title}
                      </button>
                      <span className="block font-mono text-[11px] text-muted">{row.code}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-muted">{row.stage}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{row.updatesLast30Days}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{row.avgDaysBetweenUpdates === null ? "–" : `${row.avgDaysBetweenUpdates} days`}</td>
                    <td className={cn("py-2.5 text-right tabular-nums", row.stale && "font-bold text-danger")}>
                      {row.stale && <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" aria-label="Stale" />}
                      {row.daysSinceLastUpdate === null ? "Never" : `${row.daysSinceLastUpdate} days`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Overdue" subtitle="Past their target delivery date or milestone due date.">
          {projects.overdue.length === 0 && projects.overdueMilestones.length === 0 ? (
            <p className="rounded-xl bg-teal-soft px-4 py-3 text-sm text-teal-700">Nothing overdue. 🎉</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {projects.overdue.map((p) => (
                <li key={p.code} className="flex items-center justify-between gap-3 py-2.5">
                  <button onClick={() => onOpenProject(p.code)} className="text-left">
                    <span className="block font-bold hover:underline">{p.title}</span>
                    <span className="block text-xs text-muted">
                      Delivery was {formatDate(p.targetDate)}
                      {p.lead ? ` · ${p.lead}` : ""}
                    </span>
                  </button>
                  <span className="shrink-0 rounded-full bg-danger-soft px-2.5 py-1 text-xs font-bold text-danger">
                    {p.daysOverdue} day{p.daysOverdue === 1 ? "" : "s"} late
                  </span>
                </li>
              ))}
              {projects.overdueMilestones.map((m) => (
                <li key={`${m.code}-${m.milestone}-${m.due}`} className="flex items-center justify-between gap-3 py-2.5">
                  <button onClick={() => onOpenProject(m.code)} className="text-left">
                    <span className="block font-bold hover:underline">{m.milestone}</span>
                    <span className="block text-xs text-muted">
                      {m.project} · due {formatDate(m.due)}
                    </span>
                  </button>
                  <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-700">
                    {m.daysOverdue} day{m.daysOverdue === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <DigestCard notify={notify} />
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
                    <tr key={r.courseId} className="hover:bg-mist/60">
                      <td className="py-2.5 pr-3 font-bold">{r.title}</td>
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

/** Preview and send this week's progress emails. Both come from the server. */
function DigestCard({ notify }: { notify: Notify }) {
  const { projects, loading } = useStaffProjects();
  const active = projects.filter((p) => p.stage !== "DELIVERED");
  const [code, setCode] = useState("");
  const [digest, setDigest] = useState<DigestPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);

  const chosen = code || active[0]?.code || "";

  useEffect(() => {
    if (!chosen) {
      setDigest(null);
      return;
    }
    let live = true;
    setPreviewing(true);
    setPreviewError("");
    previewDigest(chosen)
      .then((d) => {
        if (live) setDigest(d);
      })
      .catch((e) => {
        if (live) {
          setDigest(null);
          setPreviewError(errorMessage(e));
        }
      })
      .finally(() => {
        if (live) setPreviewing(false);
      });
    return () => {
      live = false;
    };
  }, [chosen]);

  const send = async () => {
    if (sending) return;
    setSending(true);
    try {
      const result = await sendWeeklyDigests();
      notify(`Weekly emails sent to ${result.sent} client${result.sent === 1 ? "" : "s"} (${result.skipped} skipped).`);
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setSending(false);
    }
  };

  return (
    <Panel
      title="Weekly progress emails"
      subtitle={`Sent every Monday by the server's cron job. ${loading ? "Loading projects…" : `${active.length} active project${active.length === 1 ? "" : "s"} are in this week's run.`}`}
      action={<Mail className="size-5 text-brand" />}
    >
      <label className="block text-xs font-bold">
        Preview for
        <select
          value={chosen}
          onChange={(e) => setCode(e.target.value)}
          disabled={active.length === 0}
          className="mt-1 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal outline-none focus:border-brand disabled:bg-mist"
        >
          {active.length === 0 && <option value="">No active projects</option>}
          {active.map((p) => (
            <option key={p.code} value={p.code}>
              {p.title}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3" role="status" aria-live="polite">
        {previewing ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin text-brand" /> Building the preview…
          </p>
        ) : previewError ? (
          <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{previewError}</p>
        ) : digest?.skipped ? (
          <p className="rounded-xl bg-mist px-3 py-2 text-sm text-muted">{digest.skipped}</p>
        ) : digest?.optedOut ? (
          <p className="rounded-xl bg-mist px-3 py-2 text-sm text-muted">This client has turned the weekly email off, so nothing is sent to them.</p>
        ) : digest?.subject ? (
          <div className="rounded-xl bg-mist p-3">
            <p className="text-sm font-bold">{digest.subject}</p>
            <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-navy/80">{digest.body}</pre>
          </div>
        ) : null}
      </div>

      <button
        onClick={() => void send()}
        disabled={sending}
        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-navy text-sm font-bold text-white hover:bg-navy-700 disabled:opacity-60"
      >
        {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {sending ? "Sending…" : "Send this week's emails now"}
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
