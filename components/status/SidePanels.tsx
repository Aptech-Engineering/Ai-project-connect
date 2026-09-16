"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CheckCircle2, Download, FileImage, FileSignature, FileText, Loader2, Star } from "lucide-react";
import { cn, daysFromNow, formatDate } from "@/lib/format";
import type { Project, SharedFile } from "@/lib/types";
import type { Notify } from "../PortalApp";
import { approveMilestoneAsClient, rateProject } from "@/lib/actions";

const card = "rounded-3xl border border-line bg-white p-5 shadow-sm sm:p-7";

export function MilestonesPanel({ project, notify }: { project: Project; notify: Notify }) {
  const isDone = (m: { completedAt?: string }) => Boolean(m.completedAt);
  const doneCount = project.milestones.filter(isDone).length;
  const total = project.milestones.length;
  const nextId = project.milestones.find((m) => !isDone(m))?.id;

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
                  onClick={() => {
                    approveMilestoneAsClient(project, m.id);
                    notify(`"${m.title}" approved. ${project.lead.name} has been notified.`);
                  }}
                  className="flex shrink-0 items-center justify-center gap-1.5 self-start rounded-full bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-navy-700 sm:self-auto"
                >
                  <FileSignature className="size-4" /> Approve
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

export function FilesPanel({ project, notify }: { project: Project; notify: Notify }) {
  const [busy, setBusy] = useState<string | null>(null);

  const download = async (file: SharedFile) => {
    setBusy(file.id);
    try {
      const { downloadMockFile } = await import("@/lib/report");
      await downloadMockFile(project, file);
      notify(`${file.name} downloaded.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className={card}>
      <h4 className="font-display text-lg font-bold">Shared files</h4>
      <p className="mt-1 text-sm text-muted">Proposals, designs and documents from your team.</p>
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
                  </span>
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
  const sent = Boolean(project.rating);

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
              rateProject(project, rating, text.trim() || undefined);
              notify(`Thanks for rating ${project.title} ${rating}/5!`);
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
              disabled={!rating}
              className="mt-2 w-full rounded-xl bg-brand py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-40"
            >
              Submit rating
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
