"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, animate, motion } from "framer-motion";
import {
  CalendarClock,
  Clock,
  Download,
  Flag,
  Loader2,
  LogOut,
  PartyPopper,
  PauseCircle,
  RefreshCw,
  Upload,
} from "lucide-react";
import StageTimeline from "./StageTimeline";
import UpdatesFeed from "./UpdatesFeed";
import StackPanel from "./StackPanel";
import { FilesPanel, MilestonesPanel, RatingPanel } from "./SidePanels";
import { ChangeRequestsPanel, EmailPreferences, HandoverPanel, WalletPanel } from "./ClientPanels";
import StageBadge from "./StageBadge";
import MessageThread from "../MessageThread";
import { postClientMessage } from "@/lib/actions";
import { errorMessage } from "@/lib/api";
import { STAGES, clientUpdates } from "@/lib/data";
import { useClientSession } from "@/lib/store";
import { useSiteContent } from "@/lib/content";
import { cn, daysFromNow, formatDate, initials, relativeDay } from "@/lib/format";
import type { Project } from "@/lib/types";
import type { Notify } from "../PortalApp";

export const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
} as const;

export default function ProjectStatus({
  project,
  onSwitch,
  onSignOut,
  notify,
}: {
  project: Project;
  onSwitch: (code: string) => void;
  onSignOut: () => void;
  notify: Notify;
}) {
  const [downloading, setDownloading] = useState(false);
  // The signed-in client's own projects, straight from the session.
  const { session } = useClientSession();
  const siblings = session?.projects ?? [];
  const { portal } = useSiteContent();
  const stage = { ...STAGES[project.stage], meaning: portal.stageMeanings?.[project.stage] || STAGES[project.stage].meaning };
  const lastUpdate = clientUpdates(project)[0];

  const downloadReport = async () => {
    setDownloading(true);
    try {
      const { downloadProjectReport } = await import("@/lib/report");
      await downloadProjectReport(project);
      notify(`Status report for ${project.title} downloaded.`);
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setDownloading(false);
    }
  };

  const sendMessage = async (text: string) => {
    try {
      await postClientMessage(project.code, text);
      notify(`Message sent to ${project.lead.name}.`);
    } catch (e) {
      notify(errorMessage(e), "info");
      throw e;
    }
  };

  return (
    <section id="status" className="relative scroll-mt-16 bg-mist pb-20 pt-10 sm:pt-14">
      <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-navy/[0.06] to-transparent" />
      <div className="container-page relative">
        {/* top bar */}
        <motion.div {...reveal} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Client portal</p>
            <h2 className="mt-1 font-display text-2xl font-bold sm:text-3xl">
              Welcome back, {project.client.name.split(" ").slice(0, project.client.name.startsWith("Dr.") ? 2 : 1).join(" ")}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={downloadReport}
              disabled={downloading}
              className="flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand/25 transition hover:-translate-y-0.5 hover:bg-brand-600 disabled:opacity-70"
            >
              {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Download report (PDF)
            </button>
            <button
              onClick={onSignOut}
              className="flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2.5 text-sm font-bold text-navy transition hover:border-navy/30"
            >
              <RefreshCw className="size-4" /> Track another
            </button>
            <button
              onClick={onSignOut}
              className="flex items-center gap-2 rounded-full px-3 py-2.5 text-sm text-muted transition hover:text-navy"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </motion.div>

        {siblings.length > 1 && (
          <motion.div {...reveal} className="no-scrollbar mt-5 flex gap-2 overflow-x-auto">
            {siblings.map((p) => (
              <button
                key={p.code}
                onClick={() => onSwitch(p.code)}
                className={cn(
                  "relative shrink-0 rounded-full px-4 py-2 text-sm font-bold transition",
                  p.code === project.code ? "text-white" : "bg-white text-navy hover:bg-blue-soft",
                )}
              >
                {p.code === project.code && (
                  <motion.span layoutId="project-tab" className="absolute inset-0 rounded-full bg-navy" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
                )}
                <span className="relative">
                  {p.title} <span className="ml-1 font-mono text-[11px] opacity-60">{p.code}</span>
                </span>
              </button>
            ))}
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={project.code}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
          >
            {/* header card */}
            <div className="mt-6 overflow-hidden rounded-3xl border border-line bg-white shadow-xl shadow-navy/5">
              <div className="h-1.5 bg-gradient-to-r from-brand via-brand to-teal" />
              <div className="p-5 sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-display text-2xl font-bold sm:text-[2rem]">{project.title}</h3>
                    <p className="mt-1 text-muted">{project.tagline}</p>
                    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                      <span>
                        Project ID: <span className="font-mono font-bold text-navy">{project.code}</span>
                      </span>
                      <Dot />
                      <span>{project.platforms}</span>
                      <Dot />
                      <span>
                        {project.deliveredDate ? "Delivered" : "Est. delivery"}:{" "}
                        <span className="font-bold text-navy">{formatDate(project.deliveredDate ?? project.targetDate)}</span>
                      </span>
                    </p>
                  </div>
                  <StageBadge stage={project.stage} large />
                </div>

                <ProgressBar project={project} />
                <StageTimeline project={project} />

                {project.stage === "ON_HOLD" && project.holdReason && (
                  <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-danger/15 bg-danger-soft p-4 sm:flex-row sm:items-center sm:p-5">
                    <PauseCircle className="size-8 shrink-0 text-danger" />
                    <div className="flex-1">
                      <p className="font-display font-semibold text-danger">Why your project is paused</p>
                      <p className="mt-0.5 text-sm text-navy/80">{project.holdReason}</p>
                    </div>
                    <button
                      onClick={() => {
                        document.getElementById("shared-files")?.scrollIntoView({ behavior: "smooth", block: "start" });
                        window.setTimeout(() => document.getElementById("client-upload")?.click(), 500);
                      }}
                      className="flex shrink-0 items-center justify-center gap-2 rounded-full bg-navy px-4 py-2.5 text-sm font-bold text-white hover:bg-navy-700"
                    >
                      <Upload className="size-4" /> Send content
                    </button>
                  </div>
                )}

                {project.stage === "DELIVERED" && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.6 }}
                    className="mt-8 flex items-center gap-4 rounded-2xl bg-gradient-to-r from-teal to-teal-700 p-4 text-white sm:p-5"
                  >
                    <PartyPopper className="size-8 shrink-0" />
                    <div>
                      <p className="font-display font-semibold">Your product is live. Congratulations!</p>
                      <p className="text-sm text-white/85">Handover documents are in your files. Your support plan is active.</p>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {/* quick stats */}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                delay={0}
                icon={<Flag className="size-5" />}
                label="Current stage"
                value={stage.label}
                hint={stage.meaning}
              />
              <StatCard
                delay={0.06}
                icon={<CalendarClock className="size-5" />}
                label={project.deliveredDate ? "Delivered on" : "Target delivery"}
                value={formatDate(project.deliveredDate ?? project.targetDate)}
                hint={
                  project.deliveredDate
                    ? `${Math.abs(daysFromNow(project.deliveredDate))} days ago · ahead of schedule`
                    : `${daysFromNow(project.targetDate)} days to go`
                }
              />
              <StatCard
                delay={0.12}
                icon={
                  <span className="grid size-full place-items-center font-display text-xs font-bold">{initials(project.lead.name)}</span>
                }
                label="Your project lead"
                value={project.lead.name}
                hint={`Team of ${project.team.length} · replies within 1 working day`}
              />
              <StatCard
                delay={0.18}
                icon={<Clock className="size-5" />}
                label="Last update"
                value={lastUpdate ? relativeDay(lastUpdate.date) : "None yet"}
                hint={lastUpdate ? `${lastUpdate.title} · ${lastUpdate.author.name.split(" ")[0]}` : "Your first update is on its way"}
              />
            </div>

            {/* main grid */}
            <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_400px]">
              <div className="flex min-w-0 flex-col gap-5">
                <HandoverPanel project={project} notify={notify} />
                <UpdatesFeed project={project} />
                <MessageThread
                  className="rounded-3xl border border-line bg-white p-5 shadow-sm sm:p-7"
                  messages={project.messages ?? []}
                  viewer="client"
                  title="Questions for your team"
                  subtitle={`Ask ${project.lead.name.split(" ")[0]} anything. You'll get an email when they reply.`}
                  placeholder="e.g. Can buyers pay on delivery too?"
                  onSend={sendMessage}
                />
                <MilestonesPanel project={project} notify={notify} />
                <ChangeRequestsPanel project={project} notify={notify} />
              </div>
              <div className="flex min-w-0 flex-col gap-5">
                <StackPanel project={project} notify={notify} />
                <FilesPanel project={project} notify={notify} />
                <WalletPanel project={project} />
                {project.stage === "DELIVERED" && <RatingPanel project={project} notify={notify} />}
                <EmailPreferences project={project} notify={notify} />
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

function Dot() {
  return <span className="size-1 rounded-full bg-muted/50" />;
}

function ProgressBar({ project }: { project: Project }) {
  const [value, setValue] = useState(0);
  const onHold = project.stage === "ON_HOLD";
  const done = project.stage === "DELIVERED";

  useEffect(() => {
    const c = animate(0, project.progress, { duration: 1.4, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setValue(Math.round(v)) });
    return () => c.stop();
  }, [project.progress]);

  return (
    <div className="mt-7">
      <div className="flex items-end justify-between">
        <span className="font-display text-sm font-semibold">Overall progress</span>
        <span className="font-display text-3xl font-extrabold tabular-nums leading-none sm:text-4xl">
          {value}
          <span className="text-lg text-muted">%</span>
        </span>
      </div>
      <div
        className="mt-3 h-4 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={project.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Overall progress"
      >
        <motion.div
          className={cn(
            "relative h-full overflow-hidden rounded-full",
            onHold ? "bg-danger/70" : done ? "bg-teal" : "bg-gradient-to-r from-brand-600 to-brand",
          )}
          initial={{ width: 0 }}
          animate={{ width: `${project.progress}%` }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {!onHold && (
            <span className="absolute inset-y-0 left-0 w-1/2 animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          )}
        </motion.div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  delay,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + delay, duration: 0.4 }}
      whileHover={{ y: -3 }}
      className="rounded-2xl border border-line bg-white p-5 shadow-sm transition-shadow hover:shadow-lg hover:shadow-navy/5"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-700">{icon}</span>
        <span className="text-xs font-bold uppercase tracking-wider text-muted">{label}</span>
      </div>
      <p className="mt-3 font-display text-lg font-bold">{value}</p>
      <p className="mt-0.5 line-clamp-2 text-sm text-muted">{hint}</p>
    </motion.div>
  );
}
