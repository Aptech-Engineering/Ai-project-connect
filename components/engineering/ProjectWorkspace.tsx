"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Download,
  FileText,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCw,
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
import { STAGES, STAGE_MIN_PROGRESS, isClientVisible } from "@/lib/data";
import { activeLeads, activeTeamMembers, canLeadProject, personOf, useStaff, useStaffUsers } from "@/lib/staff";
import { useCatalog } from "@/lib/catalog";
import { useSiteContent } from "@/lib/content";
import { errorMessage } from "@/lib/api";
import {
  addMilestone,
  addTechnology,
  approveUpdate,
  assignMember,
  changeLead,
  changeStage,
  deleteUpdate,
  postTeamReply,
  postUpdate,
  regenerateProjectCode,
  removeFile,
  removeMember,
  removeTechnology,
  shareFile,
  updateMilestone,
} from "@/lib/actions";
import { deleteProject, useStaffProject } from "@/lib/store";
import MessageThread from "../MessageThread";
import { ChangeRequestsEditor, DigestPreviewButton, HandoverEditor } from "./ProjectExtras";
import { MAX_PDF_BYTES, openRemoteFile } from "@/lib/files";
import { cn, daysFromNow, formatDate, initials, relativeDay, shortDate } from "@/lib/format";
import type { Project, SharedFile, StageKey, Update } from "@/lib/types";
import type { Notify } from "../PortalApp";
import { apiPath, daysSinceClientUpdate, isStale } from "./helpers";

const card = "rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6";
const input =
  "w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

/** Project files carry the API path they can be downloaded from. */
type ProjectFile = SharedFile & { url?: string };

export default function ProjectWorkspace({
  code,
  onBack,
  onCodeChange,
  notify,
}: {
  code: string;
  onBack: () => void;
  onCodeChange: (code: string) => void;
  notify: Notify;
}) {
  const { data: project, loading, error, refresh } = useStaffProject(code);

  if (!project) {
    return (
      <div>
        <BackLink onBack={onBack} />
        <div className="mt-4" aria-live="polite" aria-busy={loading}>
          {error ? (
            <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-12 text-center">
              <AlertTriangle className="size-6 text-danger" />
              <p className="text-sm">{error}</p>
              <button onClick={() => void refresh()} className="flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-navy hover:border-navy/30">
                <RotateCw className="size-4" /> Try again
              </button>
            </div>
          ) : (
            <div className="grid place-items-center rounded-2xl border border-line bg-white py-24 shadow-sm">
              <Loader2 className="size-7 animate-spin text-brand" />
              <p className="mt-3 text-sm text-muted">Loading this project…</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <Workspace project={project} onBack={onBack} onCodeChange={onCodeChange} notify={notify} />;
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-bold text-muted transition hover:text-navy">
      <ArrowLeft className="size-4" /> All projects
    </button>
  );
}

function Workspace({ project, onBack, onCodeChange, notify }: { project: Project; onBack: () => void; onCodeChange: (code: string) => void; notify: Notify }) {
  const me = useStaff();
  const stale = isStale(project);
  const days = daysSinceClientUpdate(project);
  const [replying, setReplying] = useState(false);

  return (
    <div>
      <BackLink onBack={onBack} />

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
              {project.client.name} · {project.platforms}
              {project.targetDate ? ` · Target ${formatDate(project.targetDate)} (${daysFromNow(project.targetDate)} days)` : " · No target date yet"}
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
              <DigestPreviewButton project={project} />
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
          <Composer project={project} notify={notify} />
          <UpdatesList project={project} notify={notify} />
          <MessageThread
            className={card}
            messages={project.messages ?? []}
            viewer="team"
            title="Client messages"
            subtitle={replying ? "Sending your reply…" : `Conversation with ${project.client.name}. Replies are emailed to the client.`}
            placeholder="Reply in plain language…"
            onSend={(text) => {
              if (replying) return;
              setReplying(true);
              postTeamReply(project.code, text)
                .then(() => notify(`Reply sent to ${project.client.name}.`))
                .catch((e) => notify(errorMessage(e), "info"))
                .finally(() => setReplying(false));
            }}
          />
          <FilesEditor project={project} notify={notify} />
          <ChangeRequestsEditor project={project} notify={notify} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <StageControl project={project} notify={notify} />
          <HandoverEditor project={project} notify={notify} />
          <StackEditor project={project} notify={notify} />
          <MilestoneEditor project={project} notify={notify} />
          <ProjectIdCard project={project} notify={notify} onCodeChange={onCodeChange} />
          <Team project={project} notify={notify} />
          {project.rating && <RatingCard rating={project.rating} client={project.client.name} />}
          <ActivityLog project={project} />
        </div>
      </div>
      {me.role === "admin" && <DangerZone project={project} onBack={onBack} notify={notify} />}

      <p className="mt-5 text-center text-xs text-muted">
        {me.role === "admin"
          ? "As an admin you can change anything on this project."
          : canLeadProject(me, project)
            ? "As the project lead you can change the stage, approve updates and manage the team."
            : "As an engineer you can post updates, tag the stack, share files and reply to the client. Client updates go to your lead first."}
      </p>
    </div>
  );
}

const TEMPLATES = [
  { label: "Feature done", title: "[Feature] is ready", body: "We've finished [feature]. Your customers can now [what they can do]. Next, we'll work on [next thing]." },
  { label: "Ready for review", title: "Ready for your review", body: "[Screens/feature] are ready for you to look at. Please share any feedback by [date] so we can keep to schedule." },
  { label: "Weekly progress", title: "This week's progress", body: "This week we completed [work done]. Next week we'll focus on [plan]. Everything is on track for [target date]." },
  { label: "Fixes shipped", title: "Improvements and fixes", body: "We fixed [number] small issues found during testing, including [example]. The app is now faster and more reliable." },
];

/** The four preview pictures the server can attach to an update. */
const SCREENSHOTS: NonNullable<Update["screenshot"]>[] = ["design", "onboarding", "payment", "dashboard"];

function Composer({ project, notify }: { project: Project; notify: Notify }) {
  const me = useStaff();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"client" | "internal">("client");
  const [demoLink, setDemoLink] = useState("");
  const [screenshot, setScreenshot] = useState<Update["screenshot"]>();
  const [extras, setExtras] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const needsApproval = me.role === "engineer" && visibility === "client";
  const valid = title.trim().length > 2 && body.trim().length > 5 && (!demoLink || /^https?:\/\/\S+\.\S+/.test(demoLink));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await postUpdate(project.code, {
        title: title.trim(),
        body: body.trim(),
        visibility,
        demoLink: demoLink.trim() || undefined,
        screenshot: visibility === "client" ? screenshot : undefined,
      });
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
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
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

      <fieldset disabled={busy} className={cn(busy && "opacity-70")}>
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

        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Headline, e.g. Checkout screens are ready" aria-label="Update headline" className={cn(input, "mt-4 h-11 font-bold")} maxLength={90} />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          aria-label="Update details"
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
                  <input value={demoLink} onChange={(e) => setDemoLink(e.target.value)} aria-label="Staging or demo link" placeholder="Staging / demo link (https://…)" className="w-full bg-transparent text-sm outline-none" />
                </div>
                {visibility === "client" && (
                  <div>
                    <p className="text-xs font-bold text-muted">Attach a preview picture</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {SCREENSHOTS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setScreenshot(screenshot === s ? undefined : s)}
                          aria-pressed={screenshot === s}
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
      </fieldset>

      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => setExtras((x) => !x)} className="flex items-center gap-1.5 text-sm font-bold text-muted hover:text-navy">
          {extras ? <X className="size-4" /> : <ImagePlus className="size-4" />} {extras ? "Hide attachments" : "Add link or picture"}
        </button>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {needsApproval && (
            <span className="flex items-center gap-1 text-xs font-bold text-brand-700">
              <ShieldAlert className="size-3.5" /> Needs lead approval
            </span>
          )}
          <button
            disabled={!valid || busy}
            className={cn(
              "flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white transition disabled:opacity-40",
              visibility === "client" ? "bg-brand hover:bg-brand-600" : "bg-navy hover:bg-navy-700",
            )}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {visibility === "internal" ? "Save note" : needsApproval ? "Send for approval" : "Publish to client"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-right text-xs font-bold text-danger" role="alert" aria-live="polite">
        {error}
      </p>
    </form>
  );
}

type Filter = "all" | "client" | "internal" | "pending";

function UpdatesList({ project, notify }: { project: Project; notify: Notify }) {
  const me = useStaff();
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const counts: Record<Filter, number> = {
    all: project.updates.length,
    client: project.updates.filter(isClientVisible).length,
    internal: project.updates.filter((u) => u.visibility === "internal").length,
    pending: project.updates.filter((u) => u.pending).length,
  };
  const list = project.updates.filter((u) =>
    filter === "all" ? true : filter === "client" ? isClientVisible(u) : filter === "internal" ? u.visibility === "internal" : u.pending,
  );

  const approve = async (u: Update) => {
    setBusy(String(u.id));
    try {
      await approveUpdate(u.id);
      notify(`Published to ${project.client.name}'s portal.`);
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (u: Update) => {
    setBusy(String(u.id));
    try {
      await deleteUpdate(u.id);
      notify(u.pending ? "Update sent back to the engineer." : "Update deleted.", "info");
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(null);
    }
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
              aria-pressed={filter === f}
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
                busy === String(u.id) && "opacity-60",
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
                      <ImagePlus className="size-3" /> {u.screenshot} picture
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
                  {u.pending && canLeadProject(me, project) && (
                    <>
                      <button
                        disabled={busy === String(u.id)}
                        onClick={() => void remove(u)}
                        className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold text-muted hover:text-danger disabled:opacity-40"
                      >
                        Reject
                      </button>
                      <button
                        disabled={busy === String(u.id)}
                        onClick={() => void approve(u)}
                        className="flex items-center gap-1 rounded-full bg-teal px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-40"
                      >
                        {busy === String(u.id) ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />} Approve &amp; publish
                      </button>
                    </>
                  )}
                  {!u.pending && canLeadProject(me, project) && u.kind !== "stage" && (
                    <button
                      disabled={busy === String(u.id)}
                      onClick={() => void remove(u)}
                      aria-label="Delete update"
                      className="rounded-full p-1.5 text-muted transition hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                    >
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

function StageControl({ project, notify }: { project: Project; notify: Notify }) {
  const me = useStaff();
  const [stage, setStage] = useState<StageKey>(project.stage);
  const [progress, setProgress] = useState(project.progress);
  const [reason, setReason] = useState(project.holdReason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = !canLeadProject(me, project);
  const meanings = useSiteContent().portal.stageMeanings;
  const dirty = stage !== project.stage || progress !== project.progress || (stage === "ON_HOLD" && reason !== (project.holdReason ?? ""));
  const valid = stage !== "ON_HOLD" || reason.trim().length > 8;

  const save = async () => {
    if (!dirty || !valid || busy) return;
    setBusy(true);
    setError("");
    const stageChanged = stage !== project.stage;
    const finalProgress = stage === "DELIVERED" ? 100 : progress;
    try {
      await changeStage(project.code, stage, finalProgress, stage === "ON_HOLD" ? reason.trim() : undefined);
      setProgress(finalProgress);
      notify(stageChanged ? `Stage updated to ${STAGES[stage].label}. A client-visible update was posted.` : `Progress set to ${finalProgress}%.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
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

      <fieldset disabled={locked || busy} className={cn("mt-4", (locked || busy) && "opacity-60")}>
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
            Saving will post a client-visible update: <b>&ldquo;{meanings?.[stage] || STAGES[stage].meaning}&rdquo;</b>
          </p>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || !valid || busy}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save changes
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="mt-2 text-xs font-bold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function StackEditor({ project, notify }: { project: Project; notify: Notify }) {
  const { technologies, technologyList } = useCatalog();
  const available = technologyList.filter((t) => !project.stack.some((s) => s.techId === t.id));
  const [techId, setTechId] = useState("");
  const [usage, setUsage] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!techId || !usage.trim() || busy) return;
    const tech = technologies[techId];
    if (!tech) return;
    setBusy(true);
    try {
      await addTechnology(project.code, techId, usage.trim());
      notify(`${tech.name} added. Clients will see it with a "Learn this" course link.`);
      setTechId("");
      setUsage("");
    } catch (err) {
      notify(errorMessage(err), "info");
    } finally {
      setBusy(false);
    }
  };

  const drop = async (id: string, name: string) => {
    setBusy(true);
    try {
      await removeTechnology(project.code, id);
      notify(`${name} removed from the stack.`, "info");
    } catch (err) {
      notify(errorMessage(err), "info");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={card}>
      <h2 className="font-display text-lg font-bold">Tech stack</h2>
      <p className="mt-1 text-xs text-muted">Shown to the client in plain language, linked to Aptech courses.</p>
      <ul className="mt-4 space-y-2">
        <AnimatePresence initial={false}>
          {project.stack.map((s) => {
            const t = technologies[s.techId];
            if (!t) return null;
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
                  disabled={busy}
                  onClick={() => void drop(s.techId, t.name)}
                  aria-label={`Remove ${t.name}`}
                  className="rounded-lg p-1.5 text-muted transition hover:bg-white hover:text-danger disabled:opacity-40"
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
          <select value={techId} onChange={(e) => setTechId(e.target.value)} disabled={busy} aria-label="Technology" className={cn(input, "h-10")}>
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
                <input value={usage} onChange={(e) => setUsage(e.target.value)} placeholder="Used for, e.g. Admin dashboard" aria-label="What it is used for" className={cn(input, "h-10")} autoFocus />
                <button disabled={!usage.trim() || busy} className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy text-white disabled:opacity-40" aria-label="Add technology">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      )}
    </div>
  );
}

function MilestoneEditor({ project, notify }: { project: Project; notify: Notify }) {
  const me = useStaff();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [needsApproval, setNeedsApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const lead = canLeadProject(me, project);
  const done = project.milestones.filter((m) => m.completedAt).length;

  const toggle = async (id: string, wasDone: boolean, name: string) => {
    if (!lead) {
      notify("Only the project lead can complete milestones.", "info");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await updateMilestone(id, { completed: !wasDone });
      notify(`${name} ${wasDone ? "reopened" : "marked done"}.`, "info");
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !due || busy) return;
    setBusy(true);
    try {
      await addMilestone(project.code, { title: title.trim(), dueDate: due, needsClientApproval: needsApproval });
      notify("Milestone added.");
      setTitle("");
      setDue("");
      setNeedsApproval(false);
      setAdding(false);
    } catch (err) {
      notify(errorMessage(err), "info");
    } finally {
      setBusy(false);
    }
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
              <button
                disabled={busy}
                onClick={() => void toggle(m.id, Boolean(m.completedAt), m.title)}
                className="flex w-full items-start gap-3 rounded-xl p-2 text-left transition hover:bg-mist disabled:opacity-60"
              >
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
        {project.milestones.length === 0 && <li className="rounded-xl border border-dashed border-line py-6 text-center text-sm text-muted">No milestones yet.</li>}
      </ul>

      {lead && (
        <AnimatePresence mode="wait" initial={false}>
          {adding ? (
            <motion.form key="form" onSubmit={add} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 space-y-2 overflow-hidden border-t border-line pt-3">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Milestone title" aria-label="Milestone title" className={cn(input, "h-10")} autoFocus />
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className={cn(input, "h-10")} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={needsApproval} onChange={(e) => setNeedsApproval(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
                Needs client sign-off
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAdding(false)} className="h-10 flex-1 rounded-xl border border-line text-sm font-bold text-muted">
                  Cancel
                </button>
                <button disabled={!title.trim() || !due || busy} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-navy text-sm font-bold text-white disabled:opacity-40">
                  {busy && <Loader2 className="size-4 animate-spin" />} Add milestone
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

function Team({ project, notify }: { project: Project; notify: Notify }) {
  const me = useStaff();
  const lead = canLeadProject(me, project);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const staffUsers = useStaffUsers();
  const available = activeTeamMembers(staffUsers).filter((u) => !project.team.some((t) => t.id === u.id));
  const leadChoices = activeLeads(staffUsers);

  const assign = async () => {
    const user = available.find((u) => String(u.id) === pick);
    if (!user || busy) return;
    setBusy(true);
    try {
      await assignMember(project.code, user.id);
      setPick("");
      notify(`${user.name} assigned and notified by email.`);
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(false);
    }
  };

  const drop = async (userId: number, name: string) => {
    setBusy(true);
    try {
      await removeMember(project.code, userId);
      notify(`${name} removed from the team.`, "info");
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(false);
    }
  };

  const setLead = async (userId: number) => {
    setBusy(true);
    try {
      const person = await changeLead(project.code, userId);
      notify(`${person.name} is now the project lead.`);
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={card}>
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <Users className="size-5 text-brand" /> Team
      </h2>
      <ul className="mt-4 space-y-2.5">
        <AnimatePresence initial={false}>
          {project.team.map((m) => {
            const memberId = m.id ?? null;
            const isLead = memberId !== null ? memberId === project.lead.id : m.name === project.lead.name;
            return (
              <motion.li key={memberId ?? m.name} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex items-center gap-3">
                <span className={cn("grid size-9 place-items-center rounded-full text-xs font-bold text-white", isLead ? "bg-brand" : "bg-navy")}>{initials(m.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{m.name}</span>
                  <span className="block text-xs text-muted">{isLead ? "Project lead" : m.role}</span>
                </span>
                {lead && !isLead && memberId !== null && (
                  <button
                    disabled={busy}
                    onClick={() => void drop(memberId, m.name)}
                    aria-label={`Remove ${m.name}`}
                    className="rounded-lg p-1.5 text-muted hover:bg-mist hover:text-danger disabled:opacity-40"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </motion.li>
            );
          })}
          {project.team.length === 0 && <li className="text-sm text-muted">Nobody is assigned yet.</li>}
        </AnimatePresence>
      </ul>

      {lead && (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <div className="flex gap-2">
            <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={busy} aria-label="Assign a team member" className={cn(input, "h-10")}>
              <option value="">Assign engineer…</option>
              {available.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.name} ({personOf(u).role})
                </option>
              ))}
            </select>
            <button
              disabled={!pick || busy}
              onClick={() => void assign()}
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy text-white disabled:opacity-40"
              aria-label="Assign"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            Project lead
            {me.role === "admin" ? (
              <select
                value={project.lead.id != null ? String(project.lead.id) : ""}
                disabled={busy}
                onChange={(e) => void setLead(Number(e.target.value))}
                className="h-8 flex-1 rounded-lg border border-line bg-white px-2 text-xs font-bold text-navy outline-none focus:border-brand disabled:opacity-40"
              >
                {!leadChoices.some((u) => u.id === project.lead.id) && <option value="">{project.lead.name}</option>}
                {leadChoices.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="flex-1 text-xs font-bold text-navy">{project.lead.name} · only an admin can change this</span>
            )}
          </label>
        </div>
      )}
    </div>
  );
}

function ProjectIdCard({ project, notify, onCodeChange }: { project: Project; notify: Notify; onCodeChange: (code: string) => void }) {
  const me = useStaff();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const regenerate = async () => {
    setBusy(true);
    try {
      const result = await regenerateProjectCode(project.code);
      setConfirming(false);
      onCodeChange(result.code);
      notify(`New Project ID ${result.code} issued. ${result.revoked} is revoked.`);
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={card}>
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <KeyRound className="size-5 text-brand" /> Project ID
      </h2>
      <p className="mt-3 rounded-xl bg-mist px-3 py-2.5 text-center font-mono text-lg font-bold tracking-wider">{project.code}</p>
      {project.revokedCodes?.length ? <p className="mt-2 text-xs text-muted">Revoked: {project.revokedCodes.join(", ")}</p> : null}
      <p className="mt-2 text-xs text-muted">Clients sign in with this ID plus a one-time code. Regenerate it if it was shared or exposed.</p>
      {canLeadProject(me, project) &&
        (confirming ? (
          <div className="mt-3 rounded-xl border border-danger/20 bg-danger-soft p-3">
            <p className="text-xs text-danger">The old ID stops working immediately and the client is sent the new one by email and SMS.</p>
            <div className="mt-2 flex gap-2">
              <button disabled={busy} onClick={() => setConfirming(false)} className="h-9 flex-1 rounded-lg border border-line bg-white text-xs font-bold text-muted disabled:opacity-40">
                Cancel
              </button>
              <button disabled={busy} onClick={() => void regenerate()} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-danger text-xs font-bold text-white disabled:opacity-60">
                {busy && <Loader2 className="size-3.5 animate-spin" />} Regenerate
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

function FilesEditor({ project, notify }: { project: Project; notify: Notify }) {
  const me = useStaff();
  const [kind, setKind] = useState<SharedFile["kind"]>("doc");
  const [busy, setBusy] = useState(false);
  const files: ProjectFile[] = project.files;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_PDF_BYTES) {
      notify("Files must be 10 MB or smaller.", "info");
      return;
    }
    setBusy(true);
    try {
      await shareFile(project.code, f, kind);
      notify(`${f.name} shared with ${project.client.name}.`);
    } catch (err) {
      notify(errorMessage(err), "info");
    } finally {
      setBusy(false);
    }
  };

  const download = async (f: ProjectFile) => {
    const path = apiPath(f.url);
    if (!path || !(await openRemoteFile(path, f.name, "download"))) notify("We couldn't open that file. Please try again.", "info");
  };

  const drop = async (f: ProjectFile) => {
    setBusy(true);
    try {
      await removeFile(f.id);
      notify(`${f.name} removed.`, "info");
    } catch (err) {
      notify(errorMessage(err), "info");
    } finally {
      setBusy(false);
    }
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
          <label className={cn("flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-navy px-3 text-xs font-bold text-white hover:bg-navy-700", busy && "pointer-events-none opacity-60")}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Upload
            <input
              type="file"
              className="sr-only"
              disabled={busy}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.zip,.docx,.xlsx,.pptx"
              onChange={(e) => void onFile(e)}
            />
          </label>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">PDFs, images, Office files or ZIP, up to 10 MB. Files are stored on the server and appear in the client&apos;s portal for download.</p>
      <ul className="mt-4 space-y-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {files.map((f) => (
            <motion.li key={f.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }} className="flex items-center gap-3 rounded-xl bg-mist p-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white">
                <FileText className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{f.name}</span>
                <span className="block text-xs text-muted">
                  {f.size} · {formatDate(f.date)}
                  {f.uploadedBy ? ` · ${f.uploadedBy}` : ""}
                  {f.source === "client" && <span className="ml-1.5 rounded-full bg-teal-soft px-1.5 py-0.5 text-[10px] font-bold text-teal-700">From client</span>}
                  {f.note && <span className="block truncate italic">&ldquo;{f.note}&rdquo;</span>}
                </span>
              </span>
              <button onClick={() => void download(f)} aria-label={`Download ${f.name}`} className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-navy">
                <Download className="size-4" />
              </button>
              {canLeadProject(me, project) && (
                <button
                  disabled={busy}
                  onClick={() => void drop(f)}
                  aria-label={`Remove ${f.name}`}
                  className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-danger disabled:opacity-40"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
        {files.length === 0 && <li className="rounded-xl border border-dashed border-line py-6 text-center text-sm text-muted">No files shared yet.</li>}
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

/**
 * Deleting a project takes the whole history with it, so the admin types the code
 * back before the button does anything.
 */
function DangerZone({ project, onBack, notify }: { project: Project; onBack: () => void; notify: Notify }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteProject(project.code, typed.trim());
      notify(`${project.title} and everything on it has been deleted.`);
      onBack();
    } catch (e) {
      notify(errorMessage(e), "info");
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 rounded-2xl border border-danger/20 bg-danger-soft/40 p-5">
      <h2 className="font-display text-sm font-bold text-danger">Danger zone</h2>
      {open ? (
        <>
          <p className="mt-1 text-sm text-navy">
            This removes <span className="font-bold">{project.title}</span> and everything on it: updates, milestones, files, client
            messages, change requests, the handover, the idea it came from and that idea&rsquo;s payments and receipts. It cannot be undone.
          </p>
          <label className="mt-3 block text-xs font-bold text-navy" htmlFor="confirm-delete-project">
            Type <span className="font-mono">{project.code}</span> to confirm
          </label>
          <input
            id="confirm-delete-project"
            value={typed}
            onChange={(e) => setTyped(e.target.value.toUpperCase())}
            autoComplete="off"
            className="mt-1 h-10 w-full max-w-xs rounded-lg border border-danger/30 px-3 font-mono text-sm outline-none focus:border-danger"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void remove()}
              disabled={busy || typed.trim().toUpperCase() !== project.code.toUpperCase()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {busy ? "Deleting…" : "Delete this project"}
            </button>
            <button onClick={() => { setOpen(false); setTyped(""); }} className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-bold text-navy">
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">Remove this project and its whole history from the platform.</p>
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-white px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger-soft">
            <Trash2 className="size-3.5" /> Delete project
          </button>
        </div>
      )}
    </div>
  );
}
