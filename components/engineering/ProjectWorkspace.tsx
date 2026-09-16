"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Download,
  FileText,
  KeyRound,
  RefreshCw,
  Star,
  Upload,
  UserPlus,
  ArrowLeft,
  Check,
  CheckCheck,
  Copy,
  Eye,
  History,
  ImagePlus,
  Link2,
  Lock,
  Plus,
  Send,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from "lucide-react";
import StageBadge from "../status/StageBadge";
import { LEADS, STAFF, STAGES, STAGE_MIN_PROGRESS, TECHNOLOGIES, isClientVisible, timelineStep } from "@/lib/data";
import { announceStage, announceUpdate, assignMember, changeLead, postTeamReply, regenerateProjectCode, removeFile, removeMember, shareFile } from "@/lib/actions";
import MessageThread from "../MessageThread";
import { updateProject, uid, withActivity } from "@/lib/store";
import { cn, daysFromNow, formatDate, initials, relativeDay, shortDate } from "@/lib/format";
import type { Project, SharedFile, StageKey, Update } from "@/lib/types";
import type { Notify } from "../PortalApp";
import { actingAs, daysSinceClientUpdate, isStale, type StaffRole } from "./helpers";

const card = "rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6";
const input =
  "w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

export default function ProjectWorkspace({
  project,
  role,
  onBack,
  onCodeChange,
  notify,
}: {
  project: Project;
  role: StaffRole;
  onBack: () => void;
  onCodeChange: (code: string) => void;
  notify: Notify;
}) {
  const stale = isStale(project);
  const days = daysSinceClientUpdate(project);

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-bold text-muted transition hover:text-navy">
        <ArrowLeft className="size-4" /> All projects
      </button>

      {/* header */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="h-1.5 bg-gradient-to-r from-brand to-teal" />
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl font-bold sm:text-3xl">{project.title}</h1>
              <StageBadge stage={project.stage} />
            </div>
            <p className="mt-1 text-sm text-muted">
              {project.client.name} · {project.platforms} · Target {formatDate(project.targetDate)} ({daysFromNow(project.targetDate)} days)
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(project.code).catch(() => {});
                  notify(`Project ID ${project.code} copied.`, "info");
                }}
                className="flex items-center gap-1.5 rounded-lg bg-mist px-2.5 py-1.5 font-mono text-xs font-bold hover:bg-blue-soft"
              >
                {project.code} <Copy className="size-3.5" />
              </button>
              <a href="/" target="_blank" className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-teal-700 hover:bg-teal-soft">
                <Eye className="size-3.5" /> Preview client portal
              </a>
            </div>
          </div>
          <div className="w-full lg:w-64">
            <div className="flex items-end justify-between">
              <span className="text-sm font-bold">Progress</span>
              <span className="font-display text-3xl font-extrabold tabular-nums">{project.progress}%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-line">
              <motion.div
                className={cn("h-full rounded-full", project.stage === "ON_HOLD" ? "bg-danger/70" : project.stage === "DELIVERED" ? "bg-teal" : "bg-brand")}
                animate={{ width: `${project.progress}%` }}
                transition={{ duration: 0.6 }}
              />
            </div>
          </div>
        </div>
      </div>

      {stale && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-danger/15 bg-danger-soft p-4 text-sm">
          <AlertTriangle className="size-5 shrink-0 text-danger" />
          <p>
            <b className="text-danger">No client-visible update in {Number.isFinite(days) ? `${days} days` : "a while"}.</b> Keep {project.client.name.split(" ")[0]} in the loop with a quick update below.
          </p>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Composer project={project} role={role} notify={notify} />
          <UpdatesList project={project} role={role} notify={notify} />
          <MessageThread
            className={card}
            messages={project.messages ?? []}
            viewer="team"
            title="Client messages"
            subtitle={`Conversation with ${project.client.name}. Replies are emailed to the client.`}
            placeholder="Reply in plain language…"
            onSend={(text) => {
              postTeamReply(project, actingAs(role), text);
              notify(`Reply sent to ${project.client.name}.`);
            }}
          />
          <FilesEditor project={project} role={role} notify={notify} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <StageControl project={project} role={role} notify={notify} />
          <StackEditor project={project} role={role} notify={notify} />
          <MilestoneEditor project={project} role={role} notify={notify} />
          <ProjectIdCard project={project} role={role} notify={notify} onCodeChange={onCodeChange} />
          <Team project={project} role={role} notify={notify} />
          {project.rating && <RatingCard rating={project.rating} client={project.client.name} />}
          <ActivityLog project={project} />
        </div>
      </div>
    </div>
  );
}

const TEMPLATES = [
  { label: "Feature done", title: "[Feature] is ready", body: "We've finished [feature]. Your customers can now [what they can do]. Next, we'll work on [next thing]." },
  { label: "Ready for review", title: "Ready for your review", body: "[Screens/feature] are ready for you to look at. Please share any feedback by [date] so we can keep to schedule." },
  { label: "Weekly progress", title: "This week's progress", body: "This week we completed [work done]. Next week we'll focus on [plan]. Everything is on track for [target date]." },
  { label: "Fixes shipped", title: "Improvements and fixes", body: "We fixed [number] small issues found during testing, including [example]. The app is now faster and more reliable." },
];

const SCREENSHOTS: NonNullable<Update["screenshot"]>[] = ["design", "onboarding", "payment", "dashboard"];

function Composer({ project, role, notify }: { project: Project; role: StaffRole; notify: Notify }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"client" | "internal">("client");
  const [demoLink, setDemoLink] = useState("");
  const [screenshot, setScreenshot] = useState<Update["screenshot"]>();
  const [extras, setExtras] = useState(false);

  const needsApproval = role === "engineer" && visibility === "client";
  const valid = title.trim().length > 2 && body.trim().length > 5 && (!demoLink || /^https?:\/\/\S+\.\S+/.test(demoLink));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const author = actingAs(role);
    const update: Update = {
      id: uid(),
      date: new Date().toISOString(),
      kind: "update",
      author,
      title: title.trim(),
      body: body.trim(),
      visibility,
      pending: needsApproval || undefined,
      demoLink: demoLink.trim() || undefined,
      screenshot: visibility === "client" ? screenshot : undefined,
    };
    updateProject(project.code, (p) =>
      withActivity(
        { ...p, updates: [update, ...p.updates] },
        author,
        visibility === "internal" ? `Added internal note "${update.title}"` : needsApproval ? `Submitted "${update.title}" for approval` : `Published "${update.title}"`,
      ),
    );
    if (visibility === "client" && !needsApproval) announceUpdate(project, update);
    notify(
      visibility === "internal"
        ? "Internal note saved. Clients can't see it."
        : needsApproval
          ? "Sent to the project lead for approval."
          : `Published. ${project.client.name} has been notified by email and SMS.`,
    );
    setTitle("");
    setBody("");
    setDemoLink("");
    setScreenshot(undefined);
    setExtras(false);
  };

  return (
    <form onSubmit={submit} className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Post an update</h2>
        <div className="relative flex rounded-xl bg-mist p-1 text-xs font-bold" role="radiogroup" aria-label="Visibility">
          {(
            [
              ["client", Eye, "Client-visible"],
              ["internal", Lock, "Internal only"],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={visibility === key}
              onClick={() => setVisibility(key)}
              className={cn("relative flex items-center gap-1.5 rounded-lg px-3 py-2 transition", visibility === key ? "text-white" : "text-muted hover:text-navy")}
            >
              {visibility === key && (
                <motion.span layoutId="vis-pill" className={cn("absolute inset-0 rounded-lg", key === "client" ? "bg-teal" : "bg-navy")} />
              )}
              <Icon className="relative size-3.5" />
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="py-1 text-xs text-muted">Quick templates:</span>
        {TEMPLATES.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => {
              setTitle(t.title);
              setBody(t.body);
            }}
            className="rounded-full border border-line px-2.5 py-1 text-xs font-bold text-muted transition hover:border-brand hover:text-brand-700"
          >
            {t.label}
          </button>
        ))}
      </div>

      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Headline, e.g. Checkout screens are ready" className={cn(input, "mt-4 h-11 font-bold")} maxLength={90} />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder={visibility === "client" ? "Explain what changed and why it matters to the client, in plain language." : "Technical notes for the team. Never shown to the client."}
        className={cn(input, "mt-2 resize-y py-3 leading-relaxed")}
      />
      {visibility === "client" && (
        <p className="mt-1.5 text-xs text-muted">
          Tip: write for a first-time founder. Say &ldquo;where your app stores its data&rdquo;, not &ldquo;PostgreSQL migration&rdquo;.
        </p>
      )}

      <AnimatePresence initial={false}>
        {extras && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 space-y-3 rounded-xl bg-mist p-3">
              <div className="flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3">
                <Link2 className="size-4 text-muted" />
                <input value={demoLink} onChange={(e) => setDemoLink(e.target.value)} placeholder="Staging / demo link (https://…)" className="w-full bg-transparent text-sm outline-none" />
              </div>
              {visibility === "client" && (
                <div>
                  <p className="text-xs font-bold text-muted">Attach a screenshot (mock)</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {SCREENSHOTS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setScreenshot(screenshot === s ? undefined : s)}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-xs font-bold capitalize transition",
                          screenshot === s ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:border-brand",
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => setExtras((x) => !x)} className="flex items-center gap-1.5 text-sm font-bold text-muted hover:text-navy">
          {extras ? <X className="size-4" /> : <ImagePlus className="size-4" />} {extras ? "Hide attachments" : "Add link or screenshot"}
        </button>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {needsApproval && (
            <span className="flex items-center gap-1 text-xs font-bold text-brand-700">
              <ShieldAlert className="size-3.5" /> Needs lead approval
            </span>
          )}
          <button
            disabled={!valid}
            className={cn(
              "flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white transition disabled:opacity-40",
              visibility === "client" ? "bg-brand hover:bg-brand-600" : "bg-navy hover:bg-navy-700",
            )}
          >
            <Send className="size-4" />
            {visibility === "internal" ? "Save note" : needsApproval ? "Send for approval" : "Publish to client"}
          </button>
        </div>
      </div>
    </form>
  );
}

type Filter = "all" | "client" | "internal" | "pending";

function UpdatesList({ project, role, notify }: { project: Project; role: StaffRole; notify: Notify }) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts: Record<Filter, number> = {
    all: project.updates.length,
    client: project.updates.filter(isClientVisible).length,
    internal: project.updates.filter((u) => u.visibility === "internal").length,
    pending: project.updates.filter((u) => u.pending).length,
  };
  const list = project.updates.filter((u) =>
    filter === "all" ? true : filter === "client" ? isClientVisible(u) : filter === "internal" ? u.visibility === "internal" : u.pending,
  );

  const approve = (u: Update) => {
    updateProject(project.code, (p) =>
      withActivity({ ...p, updates: p.updates.map((x) => (x.id === u.id ? { ...x, pending: false, date: new Date().toISOString() } : x)) }, actingAs(role), `Approved and published "${u.title}"`),
    );
    announceUpdate(project, u);
    notify(`Published to ${project.client.name}'s portal.`);
  };

  const remove = (u: Update) => {
    updateProject(project.code, (p) => withActivity({ ...p, updates: p.updates.filter((x) => x.id !== u.id) }, actingAs(role), `${u.pending ? "Rejected" : "Deleted"} "${u.title}"`));
    notify(u.pending ? "Update sent back to the engineer." : "Update deleted.", "info");
  };

  return (
    <div className={card}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-lg font-bold">Updates</h2>
        <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
          {(["all", "client", "internal", "pending"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold capitalize transition",
                filter === f ? "bg-navy text-white" : "bg-mist text-muted hover:text-navy",
              )}
            >
              {f === "client" ? "Client-visible" : f} <span className="opacity-60">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-5 space-y-3">
        <AnimatePresence initial={false}>
          {list.map((u) => (
            <motion.li
              key={u.id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className={cn(
                "rounded-xl border p-4",
                u.pending ? "border-brand/30 bg-brand-soft/40" : u.visibility === "internal" ? "border-dashed border-navy/20 bg-mist/60" : "border-line",
              )}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-muted">{shortDate(u.date)}</span>
                <span className="text-muted">· {relativeDay(u.date)}</span>
                {u.pending ? (
                  <Tag className="bg-brand text-white">Pending approval</Tag>
                ) : u.visibility === "internal" ? (
                  <Tag className="bg-navy text-white">
                    <Lock className="size-3" /> Internal
                  </Tag>
                ) : (
                  <Tag className="bg-teal-soft text-teal-700">
                    <Eye className="size-3" /> Client-visible
                  </Tag>
                )}
                {u.kind === "stage" && <Tag className="bg-blue-soft text-navy">Stage change</Tag>}
              </div>
              <p className="mt-2 font-display font-semibold">{u.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-navy/75">{u.body}</p>
              {(u.demoLink || u.screenshot) && (
                <p className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                  {u.demoLink && (
                    <span className="flex items-center gap-1">
                      <Link2 className="size-3" /> {u.demoLink}
                    </span>
                  )}
                  {u.screenshot && (
                    <span className="flex items-center gap-1 capitalize">
                      <ImagePlus className="size-3" /> {u.screenshot} screenshot
                    </span>
                  )}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs text-muted">
                  <span className="grid size-6 place-items-center rounded-full bg-navy text-[9px] font-bold text-white">{initials(u.author.name)}</span>
                  {u.author.name} · {u.author.role}
                </span>
                <div className="flex gap-2">
                  {u.pending && role === "lead" && (
                    <>
                      <button onClick={() => remove(u)} className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold text-muted hover:text-danger">
                        Reject
                      </button>
                      <button onClick={() => approve(u)} className="flex items-center gap-1 rounded-full bg-teal px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700">
                        <CheckCheck className="size-3.5" /> Approve & publish
                      </button>
                    </>
                  )}
                  {!u.pending && role === "lead" && u.kind !== "stage" && (
                    <button onClick={() => remove(u)} aria-label="Delete update" className="rounded-full p-1.5 text-muted transition hover:bg-danger-soft hover:text-danger">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
        {list.length === 0 && <li className="rounded-xl border border-dashed border-line py-10 text-center text-sm text-muted">Nothing here yet.</li>}
      </ul>
    </div>
  );
}

function Tag({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", className)}>{children}</span>;
}

const STAGE_ORDER: StageKey[] = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "DESIGN", "DEVELOPMENT", "TESTING", "DEPLOYMENT", "DELIVERED", "ON_HOLD"];

function StageControl({ project, role, notify }: { project: Project; role: StaffRole; notify: Notify }) {
  const [stage, setStage] = useState<StageKey>(project.stage);
  const [progress, setProgress] = useState(project.progress);
  const [reason, setReason] = useState(project.holdReason ?? "");
  const locked = role !== "lead";
  const dirty = stage !== project.stage || progress !== project.progress || (stage === "ON_HOLD" && reason !== (project.holdReason ?? ""));
  const valid = stage !== "ON_HOLD" || reason.trim().length > 8;

  const save = () => {
    if (!dirty || !valid) return;
    const author = actingAs(role);
    const stageChanged = stage !== project.stage;
    const finalProgress = stage === "DELIVERED" ? 100 : progress;
    updateProject(project.code, (p) => {
      let next: Project = {
        ...p,
        stage,
        progress: finalProgress,
        holdReason: stage === "ON_HOLD" ? reason.trim() : undefined,
        pausedAtStep: stage === "ON_HOLD" ? (p.stage === "ON_HOLD" ? p.pausedAtStep : timelineStep(p)) : undefined,
        deliveredDate: stage === "DELIVERED" ? (p.deliveredDate ?? new Date().toISOString()) : undefined,
      };
      if (stageChanged) {
        // PRD rule: every stage change automatically posts a client-visible update.
        next.updates = [
          {
            id: uid(),
            date: new Date().toISOString(),
            kind: "stage",
            author,
            title: stage === "ON_HOLD" ? "Project paused" : `Stage changed to ${STAGES[stage].label}`,
            body: stage === "ON_HOLD" ? reason.trim() : STAGES[stage].meaning,
          },
          ...p.updates,
        ];
        next = withActivity(next, author, `Changed stage from ${STAGES[p.stage].label} to ${STAGES[stage].label}`);
      }
      if (finalProgress !== p.progress) next = withActivity(next, author, `Set progress from ${p.progress}% to ${finalProgress}%`);
      return next;
    });
    if (stage === "DELIVERED") setProgress(100);
    if (stageChanged) announceStage(project, stage, stage === "ON_HOLD" ? reason.trim() : undefined);
    notify(stageChanged ? `Stage updated to ${STAGES[stage].label}. A client-visible update was posted.` : `Progress set to ${finalProgress}%.`);
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Stage & progress</h2>
        {locked && (
          <span className="flex items-center gap-1 rounded-full bg-mist px-2.5 py-1 text-[11px] font-bold text-muted">
            <Lock className="size-3" /> Lead only
          </span>
        )}
      </div>
      {locked && <p className="mt-1 text-xs text-muted">Only the project lead or admin can change a stage.</p>}

      <fieldset disabled={locked} className={cn("mt-4", locked && "opacity-60")}>
        <legend className="sr-only">Stage</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {STAGE_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setStage(s);
                setProgress((cur) => Math.max(s === "DELIVERED" ? 100 : cur, STAGE_MIN_PROGRESS[s] ?? 0));
              }}
              aria-pressed={stage === s}
              className={cn(
                "rounded-lg border px-1.5 py-2 text-[11px] font-bold leading-tight transition disabled:cursor-not-allowed",
                stage === s
                  ? s === "ON_HOLD"
                    ? "border-danger bg-danger text-white"
                    : "border-navy bg-navy text-white"
                  : "border-line text-muted hover:border-navy/40 hover:text-navy",
              )}
            >
              {STAGES[s].label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-sm">
            <label htmlFor="progress" className="font-bold">
              Progress
            </label>
            <span className="font-display text-lg font-bold tabular-nums">{progress}%</span>
          </div>
          <input
            id="progress"
            type="range"
            min={0}
            max={100}
            step={1}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--color-brand)] disabled:cursor-not-allowed"
          />
          <p className="text-xs text-muted">Typical for {STAGES[stage].label}: {STAGES[stage].typical}</p>
        </div>

        <AnimatePresence initial={false}>
          {stage === "ON_HOLD" && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <label htmlFor="hold-reason" className="mt-4 block text-sm font-bold">
                Reason shown to client
              </label>
              <textarea
                id="hold-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. Waiting for your product photos so we can finish the catalogue."
                className={cn(input, "mt-1.5 resize-none py-2.5")}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {stage !== project.stage && (
          <p className="mt-3 rounded-lg bg-blue-soft px-3 py-2 text-xs text-navy">
            Saving will post a client-visible update: <b>&ldquo;{STAGES[stage].meaning}&rdquo;</b>
          </p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={!dirty || !valid}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-40"
        >
          <Check className="size-4" /> Save changes
        </button>
      </fieldset>
    </div>
  );
}

function StackEditor({ project, role, notify }: { project: Project; role: StaffRole; notify: Notify }) {
  const available = Object.values(TECHNOLOGIES).filter((t) => !project.stack.some((s) => s.techId === t.id));
  const [techId, setTechId] = useState("");
  const [usage, setUsage] = useState("");
  const author = actingAs(role);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!techId || !usage.trim()) return;
    const tech = TECHNOLOGIES[techId];
    updateProject(project.code, (p) => withActivity({ ...p, stack: [...p.stack, { techId, usage: usage.trim() }] }, author, `Tagged ${tech.name} (${usage.trim()})`));
    notify(`${tech.name} added. Clients will see it with a "Learn this" course link.`);
    setTechId("");
    setUsage("");
  };

  return (
    <div className={card}>
      <h2 className="font-display text-lg font-bold">Tech stack</h2>
      <p className="mt-1 text-xs text-muted">Shown to the client in plain language, linked to Aptech courses.</p>
      <ul className="mt-4 space-y-2">
        <AnimatePresence initial={false}>
          {project.stack.map((s) => {
            const t = TECHNOLOGIES[s.techId];
            return (
              <motion.li key={s.techId} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, x: 30 }} className="flex items-center gap-3 rounded-xl bg-mist p-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-navy font-display text-[11px] font-bold" style={{ color: t.color }}>
                  {t.mark}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{t.name}</span>
                  <span className="block truncate text-xs text-muted">{s.usage}</span>
                </span>
                <button
                  onClick={() => {
                    updateProject(project.code, (p) => withActivity({ ...p, stack: p.stack.filter((x) => x.techId !== s.techId) }, author, `Removed ${t.name} from stack`));
                    notify(`${t.name} removed from the stack.`, "info");
                  }}
                  aria-label={`Remove ${t.name}`}
                  className="rounded-lg p-1.5 text-muted transition hover:bg-white hover:text-danger"
                >
                  <X className="size-4" />
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {available.length > 0 && (
        <form onSubmit={add} className="mt-3 space-y-2 border-t border-line pt-3">
          <select value={techId} onChange={(e) => setTechId(e.target.value)} aria-label="Technology" className={cn(input, "h-10")}>
            <option value="">Add technology…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.category})
              </option>
            ))}
          </select>
          <AnimatePresence>
            {techId && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="flex gap-2 overflow-hidden">
                <input value={usage} onChange={(e) => setUsage(e.target.value)} placeholder="Used for, e.g. Admin dashboard" className={cn(input, "h-10")} autoFocus />
                <button disabled={!usage.trim()} className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy text-white disabled:opacity-40" aria-label="Add technology">
                  <Plus className="size-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      )}
    </div>
  );
}

function MilestoneEditor({ project, role, notify }: { project: Project; role: StaffRole; notify: Notify }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [needsApproval, setNeedsApproval] = useState(false);
  const lead = role === "lead";
  const author = actingAs(role);
  const done = project.milestones.filter((m) => m.completedAt).length;

  const toggle = (id: string) => {
    if (!lead) {
      notify("Only the project lead can complete milestones.", "info");
      return;
    }
    const m = project.milestones.find((x) => x.id === id)!;
    updateProject(project.code, (p) =>
      withActivity(
        { ...p, milestones: p.milestones.map((x) => (x.id === id ? { ...x, completedAt: x.completedAt ? undefined : new Date().toISOString() } : x)) },
        author,
        `${m.completedAt ? "Reopened" : "Completed"} milestone "${m.title}"`,
      ),
    );
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !due) return;
    const iso = new Date(`${due}T09:30:00`).toISOString();
    const milestones = [...project.milestones, { id: uid(), title: title.trim(), due: iso, needsClientApproval: needsApproval || undefined }].sort(
      (a, b) => +new Date(a.due) - +new Date(b.due),
    );
    updateProject(project.code, (p) => withActivity({ ...p, milestones }, author, `Added milestone "${title.trim()}" due ${formatDate(iso)}`));
    notify("Milestone added.");
    setTitle("");
    setDue("");
    setNeedsApproval(false);
    setAdding(false);
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Milestones</h2>
        <span className="text-xs font-bold text-muted">
          {done}/{project.milestones.length} done
        </span>
      </div>
      <ul className="mt-4 space-y-1">
        {project.milestones.map((m) => {
          const overdue = !m.completedAt && daysFromNow(m.due) < 0;
          return (
            <li key={m.id}>
              <button onClick={() => toggle(m.id)} className="flex w-full items-start gap-3 rounded-xl p-2 text-left transition hover:bg-mist">
                <motion.span
                  animate={m.completedAt ? { scale: [1, 1.2, 1] } : {}}
                  className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2", m.completedAt ? "border-teal bg-teal text-white" : "border-line")}
                >
                  {m.completedAt && <Check className="size-3" strokeWidth={3} />}
                </motion.span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm font-bold", m.completedAt && "text-muted line-through decoration-muted/40")}>{m.title}</span>
                  <span className={cn("block text-xs", overdue ? "font-bold text-danger" : "text-muted")}>
                    {m.completedAt ? `Done ${formatDate(m.completedAt)}` : `Due ${formatDate(m.due)}${overdue ? " · overdue" : ""}`}
                    {m.clientApprovedAt ? " · approved by client" : m.needsClientApproval ? " · needs client sign-off" : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {lead && (
        <AnimatePresence mode="wait" initial={false}>
          {adding ? (
            <motion.form key="form" onSubmit={add} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 space-y-2 overflow-hidden border-t border-line pt-3">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Milestone title" className={cn(input, "h-10")} autoFocus />
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className={cn(input, "h-10")} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={needsApproval} onChange={(e) => setNeedsApproval(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
                Needs client sign-off
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAdding(false)} className="h-10 flex-1 rounded-xl border border-line text-sm font-bold text-muted">
                  Cancel
                </button>
                <button disabled={!title.trim() || !due} className="h-10 flex-1 rounded-xl bg-navy text-sm font-bold text-white disabled:opacity-40">
                  Add milestone
                </button>
              </div>
            </motion.form>
          ) : (
            <motion.button
              key="btn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAdding(true)}
              className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line text-sm font-bold text-muted transition hover:border-navy/30 hover:text-navy"
            >
              <Plus className="size-4" /> Add milestone
            </motion.button>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

function Team({ project, role, notify }: { project: Project; role: StaffRole; notify: Notify }) {
  const lead = role === "lead";
  const [pick, setPick] = useState("");
  const available = STAFF.filter((m) => !project.team.some((t) => t.name === m.name));
  const actor = actingAs(role);

  return (
    <div className={card}>
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <Users className="size-5 text-brand" /> Team
      </h2>
      <ul className="mt-4 space-y-2.5">
        <AnimatePresence initial={false}>
          {project.team.map((m) => {
            const isLead = m.name === project.lead.name;
            return (
              <motion.li key={m.name} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex items-center gap-3">
                <span className={cn("grid size-9 place-items-center rounded-full text-xs font-bold text-white", isLead ? "bg-brand" : "bg-navy")}>{initials(m.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{m.name}</span>
                  <span className="block text-xs text-muted">{isLead ? "Project lead" : m.role}</span>
                </span>
                {lead && !isLead && (
                  <button
                    onClick={() => {
                      removeMember(project, m, actor);
                      notify(`${m.name} removed from the team.`, "info");
                    }}
                    aria-label={`Remove ${m.name}`}
                    className="rounded-lg p-1.5 text-muted hover:bg-mist hover:text-danger"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      {lead && (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <div className="flex gap-2">
            <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Assign a team member" className={cn(input, "h-10")}>
              <option value="">Assign engineer…</option>
              {available.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} ({m.role})
                </option>
              ))}
            </select>
            <button
              disabled={!pick}
              onClick={() => {
                const person = STAFF.find((m) => m.name === pick)!;
                assignMember(project, person, actor);
                setPick("");
                notify(`${person.name} assigned and notified by email.`);
              }}
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy text-white disabled:opacity-40"
              aria-label="Assign"
            >
              <UserPlus className="size-4" />
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            Project lead
            <select
              value={project.lead.name}
              onChange={(e) => {
                const next = LEADS.find((l) => l.name === e.target.value)!;
                changeLead(project, next, actor);
                notify(`${next.name} is now the project lead.`);
              }}
              className="h-8 flex-1 rounded-lg border border-line bg-white px-2 text-xs font-bold text-navy outline-none focus:border-brand"
            >
              {LEADS.map((l) => (
                <option key={l.name}>{l.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

function ProjectIdCard({ project, role, notify, onCodeChange }: { project: Project; role: StaffRole; notify: Notify; onCodeChange: (code: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className={card}>
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <KeyRound className="size-5 text-brand" /> Project ID
      </h2>
      <p className="mt-3 rounded-xl bg-mist px-3 py-2.5 text-center font-mono text-lg font-bold tracking-wider">{project.code}</p>
      {project.revokedCodes?.length ? <p className="mt-2 text-xs text-muted">Revoked: {project.revokedCodes.join(", ")}</p> : null}
      <p className="mt-2 text-xs text-muted">Clients sign in with this ID plus a one-time code. Regenerate it if it was shared or exposed.</p>
      {role === "lead" &&
        (confirming ? (
          <div className="mt-3 rounded-xl border border-danger/20 bg-danger-soft p-3">
            <p className="text-xs text-danger">The old ID stops working immediately and the client is sent the new one by email and SMS.</p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setConfirming(false)} className="h-9 flex-1 rounded-lg border border-line bg-white text-xs font-bold text-muted">
                Cancel
              </button>
              <button
                onClick={() => {
                  const code = regenerateProjectCode(project, actingAs(role));
                  setConfirming(false);
                  onCodeChange(code);
                  notify(`New Project ID ${code} issued. ${project.code} is revoked.`);
                }}
                className="h-9 flex-1 rounded-lg bg-danger text-xs font-bold text-white"
              >
                Regenerate
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-line text-sm font-bold text-muted transition hover:border-danger/40 hover:text-danger"
          >
            <RefreshCw className="size-4" /> Regenerate / revoke ID
          </button>
        ))}
    </div>
  );
}

function FilesEditor({ project, role, notify }: { project: Project; role: StaffRole; notify: Notify }) {
  const [kind, setKind] = useState<SharedFile["kind"]>("doc");
  const actor = actingAs(role);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const size = f.size > 1_000_000 ? `${(f.size / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1000))} KB`;
    // Mock upload: the file's name and size are shared; the portal serves a generated sample PDF.
    shareFile(project, { name: f.name.replace(/\.[^.]+$/, "") + ".pdf", kind, size }, actor);
    notify(`${f.name} shared with ${project.client.name}.`);
  };

  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Shared files</h2>
        <div className="flex items-center gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value as SharedFile["kind"])} aria-label="File type" className="h-9 rounded-lg border border-line bg-white px-2 text-xs font-bold outline-none">
            <option value="doc">Document</option>
            <option value="design">Design</option>
            <option value="proposal">Proposal</option>
          </select>
          <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-navy px-3 text-xs font-bold text-white hover:bg-navy-700">
            <Upload className="size-3.5" /> Upload
            <input type="file" className="sr-only" onChange={onFile} />
          </label>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">Files appear in the client&apos;s portal for download.</p>
      <ul className="mt-4 space-y-2">
        <AnimatePresence initial={false}>
          {project.files.map((f) => (
            <motion.li key={f.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }} className="flex items-center gap-3 rounded-xl bg-mist p-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white">
                <FileText className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{f.name}</span>
                <span className="block text-xs text-muted">
                  {f.size} · {formatDate(f.date)}
                  {f.uploadedBy ? ` · ${f.uploadedBy}` : ""}
                </span>
              </span>
              <button
                onClick={async () => {
                  const { downloadMockFile } = await import("@/lib/report");
                  await downloadMockFile(project, f);
                }}
                aria-label={`Download ${f.name}`}
                className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-navy"
              >
                <Download className="size-4" />
              </button>
              {role === "lead" && (
                <button
                  onClick={() => {
                    removeFile(project, f.id, actor);
                    notify(`${f.name} removed.`, "info");
                  }}
                  aria-label={`Remove ${f.name}`}
                  className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-danger"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
        {project.files.length === 0 && <li className="rounded-xl border border-dashed border-line py-6 text-center text-sm text-muted">No files shared yet.</li>}
      </ul>
    </div>
  );
}

function RatingCard({ rating, client }: { rating: NonNullable<Project["rating"]>; client: string }) {
  return (
    <div className={card}>
      <h2 className="font-display text-lg font-bold">Client rating</h2>
      <div className="mt-2 flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} className={cn("size-5", n <= rating.stars ? "fill-brand text-brand" : "text-line")} />
        ))}
      </div>
      {rating.text && <p className="mt-2 text-sm italic text-navy/80">&ldquo;{rating.text}&rdquo;</p>}
      <p className="mt-1 text-xs text-muted">
        {client} · {formatDate(rating.at)}
      </p>
    </div>
  );
}

function ActivityLog({ project }: { project: Project }) {
  const items = project.activity ?? [];
  return (
    <div className={card}>
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <History className="size-5 text-brand" /> Activity log
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Changes you make are logged here with who made them and when.</p>
      ) : (
        <ol className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {items.map((a) => (
              <motion.li key={a.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="border-l-2 border-line pl-3">
                <p className="text-sm">{a.action}</p>
                <p className="text-xs text-muted">
                  {a.actor} · {new Date(a.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}
