"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ClipboardCheck, FilePlus2, ListChecks, Loader2, Mail, Plus, Send, X } from "lucide-react";
import {
  CHANGE_STATUS,
  addHandoverItem,
  addStandardHandoverItems,
  handoverBlocker,
  impactText,
  nextChangeStatuses,
  previewDigest,
  removeHandoverItem,
  requestHandoverSignOff,
  staffRaiseChange,
  staffUpdateChange,
  toggleHandoverItem,
  type DigestPreview,
} from "@/lib/flows";
import { CURRENCIES } from "@/lib/catalog";
import { useSiteContent } from "@/lib/content";
import { errorMessage } from "@/lib/api";
import { canLeadProject, useStaff } from "@/lib/staff";
import { cn, formatDate, relativeDay } from "@/lib/format";
import type { ChangeRequest, ChangeRequestStatus, Project } from "@/lib/types";
import type { Notify } from "../PortalApp";

const card = "rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6";
const inputClass = "w-full rounded-xl border border-line bg-white px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

/* ---------------- change requests ---------------- */

export function ChangeRequestsEditor({ project, notify }: { project: Project; notify: Notify }) {
  const me = useStaff();
  const lead = canLeadProject(me, project);
  const [raising, setRaising] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requests = project.changeRequests ?? [];
  const open = requests.filter((r) => ["SUBMITTED", "REVIEWING"].includes(r.status)).length;

  const raise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3 || description.trim().length < 10 || busy) return;
    setBusy(true);
    setError("");
    try {
      await staffRaiseChange(project.code, title.trim(), description.trim());
      setRaising(false);
      setTitle("");
      setDescription("");
      notify("Change request added for review.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <FilePlus2 className="size-5 text-brand" /> Change requests
        </h2>
        {open > 0 && <span className="rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold uppercase text-white">{open} to review</span>}
      </div>
      <p className="mt-1 text-xs text-muted">
        Scope changes are quoted (cost and days) and approved by the client before work starts. Approved days move the delivery date automatically.
        {!lead && " Only the project lead or an admin can quote or decide one."}
      </p>

      <ul className="mt-4 space-y-3">
        {requests.map((cr) => (
          <ChangeRequestItem key={cr.id} cr={cr} canDecide={lead} notify={notify} />
        ))}
        {requests.length === 0 && <li className="rounded-xl border border-dashed border-line py-6 text-center text-sm text-muted">No change requests.</li>}
      </ul>

      <AnimatePresence mode="wait" initial={false}>
        {raising ? (
          <motion.form key="form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 space-y-2 overflow-hidden" onSubmit={raise}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What changed in scope?" aria-label="Change title" className={cn(inputClass, "h-10")} />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Why, and what it affects" aria-label="Change description" className={cn(inputClass, "resize-none py-2")} />
            {error && (
              <p role="alert" className="text-xs font-bold text-danger">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => setRaising(false)} className="h-10 flex-1 rounded-xl border border-line text-sm font-bold text-muted disabled:opacity-40">
                Cancel
              </button>
              <button disabled={busy} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-navy text-sm font-bold text-white disabled:opacity-40">
                {busy && <Loader2 className="size-4 animate-spin" />} Add request
              </button>
            </div>
          </motion.form>
        ) : (
          <motion.button key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setRaising(true)} className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line text-sm font-bold text-muted hover:border-navy/30 hover:text-navy">
            <Plus className="size-4" /> Raise a scope change
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChangeRequestItem({ cr, canDecide, notify }: { cr: ChangeRequest; canDecide: boolean; notify: Notify }) {
  const [quoting, setQuoting] = useState(false);
  const [cost, setCost] = useState(cr.impactCost?.toString() ?? "");
  const [days, setDays] = useState(cr.impactDays?.toString() ?? "");
  const [currency, setCurrency] = useState(cr.currency);
  const [note, setNote] = useState(cr.responseNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = nextChangeStatuses(cr);

  const move = async (status: ChangeRequestStatus) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await staffUpdateChange(cr.id, {
        status,
        impactCost: cost === "" ? undefined : Number(cost),
        impactDays: days === "" ? undefined : Number(days),
        currency,
        responseNote: note.trim() || undefined,
      });
      setQuoting(false);
      notify(status === "QUOTED" ? "Impact sent to the client for a decision." : `Marked as ${CHANGE_STATUS[status].label.toLowerCase()}.`, status === "DECLINED" ? "info" : "success");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={cn("rounded-xl border p-3.5", cr.status === "SUBMITTED" ? "border-brand/40" : "border-line", busy && "opacity-70")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">{cr.title}</p>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", CHANGE_STATUS[cr.status].className)}>{CHANGE_STATUS[cr.status].label}</span>
      </div>
      <p className="mt-1 text-sm text-navy/75">{cr.description}</p>
      <p className="mt-1 text-xs text-muted">
        {cr.requestedBy === "client" ? `From client ${cr.requesterName}` : `Raised by ${cr.requesterName}`} · {relativeDay(cr.createdAt)}
        {(cr.impactCost != null || cr.impactDays != null) && ` · ${impactText(cr)}`}
      </p>
      {cr.responseNote && !quoting && <p className="mt-1 whitespace-pre-line text-xs italic text-muted">{cr.responseNote}</p>}

      {canDecide && next.length > 0 && (
        <AnimatePresence mode="wait" initial={false}>
          {quoting ? (
            <motion.div key="quote" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 space-y-2 overflow-hidden rounded-xl bg-mist p-3">
              <div className="grid grid-cols-[1fr_90px_1fr] gap-2">
                <input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Extra cost" aria-label="Extra cost" className={cn(inputClass, "h-9")} />
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency" className={cn(inputClass, "h-9 px-2")}>
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <input type="number" value={days} onChange={(e) => setDays(e.target.value)} placeholder="Extra days" aria-label="Extra days" className={cn(inputClass, "h-9")} />
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Explain the impact in plain language" aria-label="Explanation for the client" className={cn(inputClass, "resize-none py-2")} />
              {error && (
                <p role="alert" className="text-xs font-bold text-danger">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => setQuoting(false)} className="h-9 flex-1 rounded-lg border border-line bg-white text-xs font-bold text-muted disabled:opacity-40">
                  Cancel
                </button>
                <button type="button" disabled={busy} onClick={() => void move("QUOTED")} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand text-xs font-bold text-white disabled:opacity-40">
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Send to client
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 flex flex-wrap gap-1.5">
              {next.includes("QUOTED") && (
                <button disabled={busy} onClick={() => setQuoting(true)} className="rounded-lg bg-navy px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
                  Quote impact
                </button>
              )}
              {next
                .filter((s) => s !== "QUOTED")
                .map((s) => (
                  <button
                    key={s}
                    disabled={busy}
                    onClick={() => void move(s)}
                    className={cn("rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-40", s === "DECLINED" ? "border border-line text-muted hover:text-danger" : "bg-mist text-navy hover:bg-blue-soft")}
                  >
                    {s === "REVIEWING" ? "Mark reviewing" : s === "DECLINED" ? "Decline" : "Mark completed"}
                  </button>
                ))}
              {error && (
                <p role="alert" className="w-full text-xs font-bold text-danger">
                  {error}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </li>
  );
}

/* ---------------- handover ---------------- */

export function HandoverEditor({ project, notify }: { project: Project; notify: Notify }) {
  const me = useStaff();
  const lead = canLeadProject(me, project);
  const { supportPlans } = useSiteContent();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const handover = project.handover ?? { items: [] };
  const done = handover.items.filter((i) => i.doneAt).length;
  const blocker = handoverBlocker(project);
  const signed = Boolean(handover.signedAt);
  const show = handover.items.length > 0 || ["TESTING", "DEPLOYMENT", "DELIVERED"].includes(project.stage);
  if (!show) return null;

  const run = async (job: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await job();
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn(card, handover.requestedAt && !signed && "border-teal/40")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <ClipboardCheck className="size-5 text-teal" /> Handover
        </h2>
        <span className="text-xs font-bold text-muted">
          {done}/{handover.items.length} done
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {signed
          ? `Signed by ${handover.signedName} on ${formatDate(handover.signedAt!)} · ${supportPlans.plans.find((p) => p.id === handover.supportPlan)?.name ?? handover.supportPlan} plan`
          : handover.requestedAt
            ? `Sign-off requested ${relativeDay(handover.requestedAt).toLowerCase()}. Waiting for the client.`
            : "Complete the checklist, then ask the client to sign off and choose a support plan."}
      </p>

      <ul className="mt-4 space-y-1">
        {handover.items.map((item) => (
          <li key={item.id} className="group flex items-start gap-2">
            <button
              disabled={signed || busy}
              onClick={() =>
                void run(async () => {
                  await toggleHandoverItem(item.id, !item.doneAt);
                })
              }
              className="flex flex-1 items-start gap-2.5 rounded-lg p-1.5 text-left text-sm transition hover:bg-mist disabled:cursor-default disabled:hover:bg-transparent"
            >
              <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2", item.doneAt ? "border-teal bg-teal text-white" : "border-line")}>{item.doneAt && <Check className="size-3" strokeWidth={3} />}</span>
              <span>
                <span className={cn("block", item.doneAt && "text-muted")}>{item.title}</span>
                {item.doneBy && <span className="block text-[11px] text-muted">Done by {item.doneBy}</span>}
              </span>
            </button>
            {lead && !signed && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await removeHandoverItem(item.id);
                  })
                }
                aria-label={`Remove ${item.title}`}
                className="mt-1 rounded-md p-1 text-muted opacity-0 transition hover:text-danger group-hover:opacity-100 disabled:opacity-0"
              >
                <X className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {!signed && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          {handover.items.length === 0 && (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const added = await addStandardHandoverItems(project.code);
                  notify(`${added} standard checklist items added.`);
                })
              }
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-mist text-sm font-bold text-navy hover:bg-blue-soft disabled:opacity-40"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ListChecks className="size-4" />} Add standard checklist
            </button>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim().length < 3) return;
              void run(async () => {
                await addHandoverItem(project.code, title.trim());
                setTitle("");
              });
            }}
          >
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add checklist item" aria-label="Checklist item" className={cn(inputClass, "h-10")} />
            <button disabled={title.trim().length < 3 || busy} aria-label="Add item" className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy text-white disabled:opacity-40">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            </button>
          </form>
          {lead && !handover.requestedAt && (
            <>
              <button
                disabled={Boolean(blocker) || busy}
                onClick={() =>
                  void run(async () => {
                    await requestHandoverSignOff(project.code);
                    notify(`Sign-off request sent to ${project.client.name}.`);
                  })
                }
                className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-teal text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-40"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Request client sign-off
              </button>
              {blocker && <p className="text-center text-xs text-muted">{blocker}</p>}
            </>
          )}
          {!lead && <p className="text-center text-xs text-muted">Only the project lead or an admin can request sign-off.</p>}
        </div>
      )}
    </div>
  );
}

/* ---------------- weekly digest preview ---------------- */

export function DigestPreviewButton({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const [digest, setDigest] = useState<DigestPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // The server writes the email, so we ask it what this client would receive.
  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    setError("");
    previewDigest(project.code)
      .then((d) => live && setDigest(d))
      .catch((e) => live && setError(errorMessage(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [open, project.code]);

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-navy hover:bg-blue-soft">
        <Mail className="size-3.5" /> Weekly email preview
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[80] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <motion.div role="dialog" aria-modal="true" aria-label="Weekly email preview" initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }} className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Weekly progress email</p>
                  <p className="mt-1 font-display text-lg font-bold">{loading ? "Loading…" : (digest?.subject ?? "No weekly email")}</p>
                  <p className="text-xs text-muted">
                    To {project.client.name} · {project.client.emailMasked}
                    {digest?.optedOut && " · client turned these off"}
                  </p>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1.5 text-muted hover:bg-mist">
                  <X className="size-5" />
                </button>
              </div>
              <div className="mt-4" aria-live="polite" aria-busy={loading}>
                {loading ? (
                  <div className="grid place-items-center rounded-2xl bg-mist py-16">
                    <Loader2 className="size-6 animate-spin text-brand" />
                  </div>
                ) : error ? (
                  <p role="alert" className="rounded-2xl bg-danger-soft p-4 text-sm text-danger">
                    {error}
                  </p>
                ) : (
                  <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-mist p-4 font-sans text-sm leading-relaxed text-navy">
                    {digest?.body ?? digest?.skipped ?? "There's nothing to send this week."}
                  </pre>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
