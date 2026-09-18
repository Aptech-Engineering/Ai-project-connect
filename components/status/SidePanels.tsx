"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CheckCircle2, Download, FileImage, FileSignature, FileText, Loader2, Star, UploadCloud, X } from "lucide-react";
import { cn, daysFromNow, formatDate } from "@/lib/format";
import type { Project, SharedFile } from "@/lib/types";
import type { Notify } from "../PortalApp";
import { approveMilestoneAsClient, rateProject } from "@/lib/actions";
import { clientUploadFile } from "@/lib/flows";
import { errorMessage } from "@/lib/api";
import { formatBytes, openRemoteFile } from "@/lib/files";

const card = "rounded-3xl border border-line bg-white p-5 shadow-sm sm:p-7";

export function MilestonesPanel({ project, notify }: { project: Project; notify: Notify }) {
  const [approving, setApproving] = useState<string | null>(null);
  const isDone = (m: { completedAt?: string }) => Boolean(m.completedAt);
  const doneCount = project.milestones.filter(isDone).length;
  const total = project.milestones.length;
  const nextId = project.milestones.find((m) => !isDone(m))?.id;

  const approve = async (id: string, title: string) => {
    setApproving(id);
    try {
      await approveMilestoneAsClient(project.code, id);
      notify(`"${title}" approved. ${project.lead.name} has been notified.`);
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setApproving(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className={card}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-display text-lg font-bold">Milestones</h4>
        <span className="text-sm text-muted">
          <b className="text-navy">{doneCount}</b> of {total} complete
        </span>
      </div>
      <div className="mt-3 flex gap-1">
        {project.milestones.map((m) => (
          <span key={m.id} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-500", isDone(m) ? "bg-teal" : "bg-line")} />
        ))}
      </div>

      <ul className="mt-5 divide-y divide-line">
        {project.milestones.map((m) => {
          const done = isDone(m);
          const due = daysFromNow(m.due);
          const canApprove = m.needsClientApproval && !done && m.id === nextId;
          return (
            <li key={m.id} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-start gap-3">
                <motion.span
                  animate={done ? { scale: [1, 1.25, 1] } : {}}
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2",
                    done ? "border-teal bg-teal text-white" : m.id === nextId ? "border-brand" : "border-line",
                  )}
                >
                  {done && <Check className="size-3.5" strokeWidth={3} />}
                </motion.span>
                <div>
                  <p className={cn("font-bold", done ? "text-navy" : "text-navy/85")}>{m.title}</p>
                  <p className="text-xs text-muted">
                    {done
                      ? `Completed ${formatDate(m.completedAt!)}`
                      : `Due ${formatDate(m.due)} · ${due < 0 ? `${-due} days overdue` : due === 0 ? "today" : `in ${due} days`}`}
                    {m.needsClientApproval && (
                      <span className={cn("ml-2 font-bold", done ? "text-teal-700" : "text-brand-700")}>
                        {m.clientApprovedAt ? "· Approved by you" : done ? "· Signed off" : "· Needs your approval"}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {canApprove && (
                <button
                  onClick={() => void approve(m.id, m.title)}
                  disabled={approving !== null}
                  className="flex shrink-0 items-center justify-center gap-1.5 self-start rounded-full bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-navy-700 disabled:opacity-50 sm:self-auto"
                >
                  {approving === m.id ? <Loader2 className="size-4 animate-spin" /> : <FileSignature className="size-4" />}
                  {approving === m.id ? "Approving…" : "Approve"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}

const FILE_ICON: Record<SharedFile["kind"], React.ElementType> = {
  proposal: FileSignature,
  design: FileImage,
  doc: FileText,
};

const CLIENT_UPLOAD_TYPES = ".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx,.zip";
const CLIENT_UPLOAD_MAX = 20 * 1024 * 1024;

export function FilesPanel({ project, notify }: { project: Project; notify: Notify }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");

  const pick = (file?: File) => {
    setError("");
    if (!file) return;
    if (!new RegExp(`(${CLIENT_UPLOAD_TYPES.split(",").map((e) => e.replace(".", "\\.")).join("|")})$`, "i").test(file.name)) return setError("Use PDF, images, Word, Excel, PowerPoint or ZIP files.");
    if (file.size > CLIENT_UPLOAD_MAX) return setError("Files must be 20 MB or smaller.");
    setPending(file);
  };

  const upload = async () => {
    if (!pending) return;
    setUploading(true);
    setError("");
    try {
      const name = pending.name;
      await clientUploadFile(project.code, pending, note.trim() || undefined);
      notify(`${name} shared with ${project.lead.name}.`);
      setPending(null);
      setNote("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const download = async (file: SharedFile) => {
    setBusy(file.id);
    setError("");
    try {
      const ok = await openRemoteFile(`/client/projects/${encodeURIComponent(project.code)}/files/${file.id}`, file.name, "download");
      if (ok) notify(`${file.name} downloaded.`);
      else setError(`We couldn't open ${file.name}. Please try again.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className={card}>
      <h4 id="shared-files" className="scroll-mt-24 font-display text-lg font-bold">
        Shared files
      </h4>
      <p className="mt-1 text-sm text-muted">Documents from your team, and anything you send them.</p>

      <div className="mt-4">
        {pending ? (
          <div className="space-y-2 rounded-2xl border border-brand/30 bg-brand-soft/30 p-3">
            <div className="flex items-center gap-3">
              <FileText className="size-5 shrink-0 text-brand-700" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{pending.name}</span>
                <span className="block text-xs text-muted">{formatBytes(pending.size)}</span>
              </span>
              <button onClick={() => setPending(null)} aria-label="Remove file" className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-danger">
                <X className="size-4" />
              </button>
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for your team (optional)" aria-label="Note for your team" className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-brand" />
            <button onClick={upload} disabled={uploading} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-navy text-sm font-bold text-white disabled:opacity-60">
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />} Send to your team
            </button>
          </div>
        ) : (
          <label
            htmlFor="client-upload"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={cn("flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-3 transition", dragOver ? "border-brand bg-brand-soft/40" : "border-line hover:border-brand/40")}
          >
            <UploadCloud className="size-5 shrink-0 text-brand" />
            <span className="text-sm">
              <span className="font-bold">Upload content, logos or documents</span>
              <span className="block text-xs text-muted">PDF, images, Office files or ZIP · max 20 MB</span>
            </span>
            <input
              id="client-upload"
              type="file"
              accept={CLIENT_UPLOAD_TYPES}
              className="sr-only"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        )}
        <div aria-live="polite" className="min-h-0">
          {error && <p className="mt-2 text-xs font-bold text-danger">{error}</p>}
        </div>
      </div>
      {project.files.length === 0 && <p className="mt-4 rounded-2xl border border-dashed border-line p-4 text-sm text-muted">No files shared yet.</p>}
      <ul className="mt-4 space-y-2">
        {project.files.map((f) => {
          const Icon = FILE_ICON[f.kind];
          return (
            <li key={f.id}>
              <button
                onClick={() => download(f)}
                disabled={busy === f.id}
                className="group flex w-full items-center gap-3 rounded-2xl border border-line p-3 text-left transition hover:border-brand/40 hover:bg-brand-soft/40"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mist text-navy transition group-hover:bg-white">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{f.name}</span>
                  <span className="block text-xs text-muted">
                    {f.size} · {formatDate(f.date)}
                    {f.source === "client" && <span className="ml-1.5 rounded-full bg-teal-soft px-1.5 py-0.5 text-[10px] font-bold text-teal-700">You sent this</span>}
                  </span>
                  {f.note && <span className="mt-0.5 block truncate text-xs italic text-muted">&ldquo;{f.note}&rdquo;</span>}
                </span>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-navy text-white transition group-hover:bg-brand">
                  {busy === f.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}

export function RatingPanel({ project, notify }: { project: Project; notify: Notify }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const sent = Boolean(project.rating);

  const submit = async () => {
    setSaving(true);
    try {
      await rateProject(project.code, rating, text.trim() || undefined);
      notify(`Thanks for rating ${project.title} ${rating}/5!`);
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className={card}>
      <AnimatePresence mode="wait">
        {sent ? (
          <motion.div key="thanks" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-4 text-center">
            <CheckCircle2 className="mx-auto size-10 text-teal" />
            <p className="mt-2 font-display font-bold">Thank you for your feedback!</p>
            <p className="text-sm text-muted">You rated this build {project.rating?.stars}/5. It helps us build better products.</p>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            exit={{ opacity: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!rating || saving) return;
              void submit();
            }}
          >
            <h4 className="font-display text-lg font-bold">How did we do?</h4>
            <p className="mt-1 text-sm text-muted">Rate your experience with the {project.title} build.</p>
            <div className="mt-3 flex gap-1" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <motion.button
                  key={n}
                  type="button"
                  whileTap={{ scale: 0.8 }}
                  whileHover={{ scale: 1.15 }}
                  onMouseEnter={() => setHover(n)}
                  onClick={() => setRating(n)}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                >
                  <Star className={cn("size-8 transition", (hover || rating) >= n ? "fill-brand text-brand" : "text-line")} />
                </motion.button>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Share a short testimonial (optional)"
              className="mt-3 w-full resize-none rounded-xl border border-line p-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
            <button
              disabled={!rating || saving}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-40"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "Sending…" : "Submit rating"}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
