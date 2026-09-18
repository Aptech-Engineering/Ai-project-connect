"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  Copy,
  Lightbulb,
  Download,
  Eye,
  FileText,
  Mail,
  Paperclip,
  MapPin,
  Phone,
  Rocket,
  Search,
  Lock,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { IDEA_STATUSES, updateIdea, useIdeas, type Idea, type IdeaStatus } from "@/lib/ideas";
import { convertIdeaToProject } from "@/lib/actions";
import { activeLeads, personOf, useStaff, useStaffUsers } from "@/lib/staff";
import { cn, formatDate, initials, relativeDay } from "@/lib/format";
import { formatBytes, openStoredFile } from "@/lib/files";
import type { Notify } from "../PortalApp";
import { actingAs, type StaffRole } from "./helpers";
import QuotePanel from "./QuotePanel";
import PaymentPanel from "./PaymentPanel";
import { formatPrice } from "@/lib/catalog";
import { FEE_STATES, REFUND_STATES, declineIdea, feeState, paidPayment, paymentBlocker } from "@/lib/wallet";


type Filter = IdeaStatus | "ALL";

export default function IdeasInbox({
  role,
  notify,
  onOpenProject,
  initialFilter,
  initialSelectedId,
}: {
  role: StaffRole;
  notify: Notify;
  onOpenProject: (code: string) => void;
  initialFilter?: Filter;
  initialSelectedId?: string;
}) {
  const me = useStaff();
  const ideas = useIdeas();
  const focused = initialSelectedId ? ideas.find((i) => i.id === initialSelectedId) : undefined;
  const [filter, setFilter] = useState<Filter>(initialFilter ?? (focused?.status === "DRAFT" ? "DRAFT" : "ALL"));
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const selected = ideas.find((i) => i.id === selectedId);

  const counts = ideas.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.status]: (acc[i.status] ?? 0) + 1 }), {});
  const submitted = ideas.filter((i) => i.status !== "DRAFT");
  const toConfirm = submitted.filter((i) => feeState(i) === "AWAITING_CONFIRMATION").length;
  const filters = (["ALL", ...Object.keys(IDEA_STATUSES).filter((k) => k !== "DRAFT"), ...(me.role === "admin" ? ["DRAFT"] : [])] as Filter[]);
  const q = query.trim().toLowerCase();
  const list = ideas.filter(
    (i) =>
      (filter === "ALL" ? i.status !== "DRAFT" : i.status === filter) &&
      (me.role === "admin" || i.status !== "DRAFT") &&
      (!q || [i.title, i.name, i.ref, i.category, i.location, i.email].some((s) => s.toLowerCase().includes(q))),
  );

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Submitted ideas</h1>
      <p className="mt-1 text-muted">Ideas sent through the &ldquo;Submit your idea&rdquo; form. An idea can only be approved once its commitment fee is paid.</p>
      {toConfirm > 0 && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-brand-soft px-4 py-2.5 text-sm text-brand-700">
          <Wallet className="size-4" /> {toConfirm} bank transfer{toConfirm === 1 ? "" : "s"} waiting for confirmation.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
          <Search className="size-4 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by idea, name, reference or location" className="h-full w-full bg-transparent text-sm outline-none" />
        </div>
      </div>
      <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition", filter === f ? "bg-navy text-white" : "bg-white text-muted hover:text-navy")}
          >
            {f === "ALL" ? "All" : f === "DRAFT" ? "Unfinished drafts" : IDEA_STATUSES[f].label} <span className="opacity-60">{f === "ALL" ? submitted.length : (counts[f] ?? 0)}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        {/* list */}
        <ul className={cn("space-y-2.5", selected && "hidden lg:block")}>
          <AnimatePresence initial={false}>
            {list.map((idea, i) => (
              <motion.li key={idea.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <button
                  onClick={() => {
                    setSelectedId(idea.id);
                    if (idea.status === "NEW") updateIdea(idea.id, { status: "REVIEWING" });
                  }}
                  className={cn(
                    "w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:shadow-md",
                    selectedId === idea.id ? "border-brand ring-4 ring-brand/10" : "border-line",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate font-display font-semibold">
                        {idea.status === "NEW" && <span className="size-2 shrink-0 rounded-full bg-brand" />}
                        {idea.title}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {idea.name} · {idea.location}
                      </p>
                    </div>
                    <StatusPill status={idea.status} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-navy/75">{idea.problem || "Not filled in yet."}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span className="font-mono">{idea.ref}</span>
                    <FeeBadge idea={idea} />
                    <span>{idea.category}</span>
                    <span>{idea.budget}</span>
                    {idea.attachment && (
                      <span className="flex items-center gap-1 font-bold text-navy">
                        <Paperclip className="size-3" /> PDF
                      </span>
                    )}
                    <span className="ml-auto">{idea.status === "DRAFT" ? `saved ${relativeDay(idea.lastSavedAt ?? idea.submittedAt).toLowerCase()}` : relativeDay(idea.submittedAt)}</span>
                  </div>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
          {list.length === 0 && (
            <li className="rounded-2xl border border-dashed border-line bg-white py-14 text-center text-sm text-muted">
              <Lightbulb className="mx-auto mb-2 size-8 text-line" /> No ideas here yet.
            </li>
          )}
        </ul>

        {/* detail */}
        <div className={cn(!selected && "hidden lg:block")}>
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div key={selected.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="lg:sticky lg:top-6">
                <IdeaDetail idea={selected} role={role} notify={notify} onBack={() => setSelectedId(null)} onOpenProject={onOpenProject} />
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid h-72 place-items-center rounded-2xl border border-dashed border-line bg-white/60 text-center text-sm text-muted">
                <span>
                  <Lightbulb className="mx-auto mb-2 size-8 text-brand" />
                  Select an idea to review it.
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function FeeBadge({ idea }: { idea: Idea }) {
  const refund = paidPayment(idea)?.refund;
  const meta = refund && refund.status !== "REFUNDED" ? REFUND_STATES[refund.status] : FEE_STATES[feeState(idea)];
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", meta.className)}>{meta.label}</span>;
}

function StatusPill({ status }: { status: IdeaStatus }) {
  return <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", IDEA_STATUSES[status].className)}>{IDEA_STATUSES[status].label}</span>;
}

function IdeaDetail({ idea, role, notify, onBack, onOpenProject }: { idea: Idea; role: StaffRole; notify: Notify; onBack: () => void; onOpenProject: (code: string) => void }) {
  const me = useStaff();
  const [notes, setNotes] = useState(idea.notes ?? "");
  const [converting, setConverting] = useState(false);
  const leadChoices = activeLeads(useStaffUsers());
  const [leadName, setLeadName] = useState(leadChoices.find((u) => u.role === "lead")?.name ?? leadChoices[0]?.name ?? "");
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  });

  const blocker = paymentBlocker(idea);

  const convert = () => {
    if (blocker) return notify(blocker, "info");
    const leadUser = leadChoices.find((u) => u.name === leadName);
    if (!leadUser) return;
    const lead = personOf(leadUser);
    const code = convertIdeaToProject(idea, lead, targetDate, actingAs(me), notes || idea.notes);
    setConverting(false);
    notify(`Project ${code} created. Welcome email & SMS with the Project ID sent to ${idea.name}.`);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="h-1.5 bg-gradient-to-r from-brand to-teal" />
      <div className="p-5 sm:p-6">
        <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm font-bold text-muted hover:text-navy lg:hidden">
          <ArrowLeft className="size-4" /> All ideas
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-muted">
              {idea.ref} · {idea.status === "DRAFT" ? `draft saved ${formatDate(idea.lastSavedAt ?? idea.submittedAt)}${idea.startedBy ? ` · started by ${idea.startedBy}` : ""}` : `submitted ${formatDate(idea.submittedAt)}`}
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold">{idea.title}</h2>
            <p className="text-sm text-muted">
              {idea.category} · {idea.platforms.join(", ")}
            </p>
          </div>
          <StatusPill status={idea.status} />
        </div>

        {/* contact */}
        <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-mist p-4 sm:flex-row sm:items-center">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-navy font-display font-bold text-white">{initials(idea.name)}</span>
          <div className="grid flex-1 gap-1.5 text-sm sm:grid-cols-2">
            <p className="font-bold sm:col-span-2">{idea.name}</p>
            <a href={`mailto:${idea.email}`} className="flex items-center gap-2 text-navy/80 hover:text-brand-700">
              <Mail className="size-4 text-muted" /> {idea.email}
            </a>
            <a href={`tel:${idea.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 text-navy/80 hover:text-brand-700">
              <Phone className="size-4 text-muted" /> {idea.phone}
            </a>
            {idea.organisation && (
              <span className="flex items-center gap-2 text-navy/80">
                <Building2 className="size-4 text-muted" /> {idea.organisation}
              </span>
            )}
            <span className="flex items-center gap-2 text-navy/80">
              <MapPin className="size-4 text-muted" /> {idea.location}
            </span>
          </div>
        </div>

        {idea.attachment && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-line p-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger">
              <FileText className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">{idea.attachment.name}</span>
              <span className="block text-xs text-muted">PDF brief from {idea.name.split(" ")[0]} · {formatBytes(idea.attachment.size)}</span>
            </span>
            {(["view", "download"] as const).map((mode) => (
              <button
                key={mode}
                onClick={async () => {
                  const ok = await openStoredFile(idea.attachment!.id, idea.attachment!.name, mode);
                  if (!ok) notify("This file is no longer available in this browser.", "info");
                }}
                aria-label={mode === "view" ? "View PDF" : "Download PDF"}
                className="flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-bold transition hover:border-navy"
              >
                {mode === "view" ? <Eye className="size-3.5" /> : <Download className="size-3.5" />}
                <span className="hidden sm:inline">{mode === "view" ? "View" : "Download"}</span>
              </button>
            ))}
          </div>
        )}

        <dl className="mt-5 space-y-4 text-sm">
          <Section label="Problem">{idea.problem}</Section>
          <Section label="Target users">{idea.targetUsers}</Section>
          <Section label="Key features">{idea.features}</Section>
        </dl>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Fact icon={<Wallet className="size-4" />} label="Budget" value={idea.budget} />
          <Fact icon={<CalendarClock className="size-4" />} label="Timeline" value={idea.timeline} />
          <Fact icon={<ShieldCheck className="size-4" />} label="NDA" value={idea.nda ? "Requested" : "Not needed"} />
        </div>

        {/* notes */}
        <label htmlFor="idea-notes" className="mt-5 block text-sm font-bold">
          Internal notes
        </label>
        <textarea
          id="idea-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (idea.notes ?? "") && updateIdea(idea.id, { notes })}
          rows={2}
          placeholder="Feasibility, suggested stack, call notes… (never shown to the client)"
          className="mt-1.5 w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
        />

        <PaymentPanel idea={idea} notify={notify} />

        {idea.status !== "DRAFT" && <QuotePanel idea={idea} notify={notify} />}

        {/* actions */}
        {idea.status === "DRAFT" ? (
          <p className="mt-5 rounded-xl bg-mist px-4 py-3 text-sm text-muted">
            This application isn&apos;t submitted yet. It appears in the inbox once the client finishes it and pays the commitment fee.
          </p>
        ) : idea.projectCode ? (
          <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-teal-soft p-4 sm:flex-row sm:items-center">
            <CheckCircle2 className="size-7 shrink-0 text-teal" />
            <p className="flex-1 text-sm">
              Registered as project <b className="font-mono">{idea.projectCode}</b>. The client can now track it with this Project ID.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(idea.projectCode!).catch(() => {});
                  notify("Project ID copied.", "info");
                }}
                className="rounded-full bg-white p-2.5 text-navy shadow-sm"
                aria-label="Copy Project ID"
              >
                <Copy className="size-4" />
              </button>
              <button onClick={() => onOpenProject(idea.projectCode!)} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy-700">
                Open project
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-5 text-sm font-bold">Status</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["REVIEWING", "QUOTE_SENT", "DECLINED"] as IdeaStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    if (s === idea.status) return;
                    if (s === "QUOTE_SENT" && blocker) return notify(blocker, "info");
                    if (s === "DECLINED") {
                      const paid = paidPayment(idea);
                      if (!window.confirm(`Decline ${idea.title}?${paid && !paid.refund ? ` The ${formatPrice(paid.amount, paid.currency)} commitment fee will be queued for a full refund.` : ""}`)) return;
                      if (notes !== (idea.notes ?? "")) updateIdea(idea.id, { notes });
                      const result = declineIdea(idea.id, actingAs(me));
                      if (!result.ok) return notify(result.error, "info");
                      return notify(result.refundQueued ? `Idea declined. Refund queued for ${idea.name}.` : "Idea declined.", "info");
                    }
                    updateIdea(idea.id, { status: s, notes });
                    notify(s === "QUOTE_SENT" ? `Marked as quote sent to ${idea.name}.` : `Status changed to ${IDEA_STATUSES[s].label}.`, "info");
                  }}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-xs font-bold transition",
                    idea.status === s ? "border-navy bg-navy text-white" : "border-line text-muted hover:border-navy/40 hover:text-navy",
                  )}
                >
                  {IDEA_STATUSES[s].label}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {converting ? (
                <motion.div key="convert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-5 space-y-3 rounded-2xl border border-brand/30 bg-brand-soft/40 p-4">
                    <p className="font-display font-semibold">Register client & project</p>
                    <p className="text-xs text-muted">Creates the client account and a unique Project ID, then sends the welcome email and SMS.</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-bold">
                        Project lead
                        <select value={leadName} onChange={(e) => setLeadName(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal outline-none focus:border-brand">
                          {leadChoices.map((u) => (
                            <option key={u.id}>{u.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-bold">
                        Target delivery
                        <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal outline-none focus:border-brand" />
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setConverting(false)} className="h-11 flex-1 rounded-xl border border-line bg-white text-sm font-bold text-muted">
                        Cancel
                      </button>
                      <button onClick={convert} disabled={!targetDate} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-40">
                        <Rocket className="size-4" /> Create project
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                me.role !== "admin" ? (
                  <p key="btn" className="mt-5 rounded-xl bg-mist px-4 py-3 text-sm text-muted">
                    Only an admin can register this idea as a project. Mark it as <b>Quote sent</b> and let an admin know.
                  </p>
                ) : (
                <motion.button
                  key="btn"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setConverting(true)}
                  disabled={idea.status === "DECLINED" || Boolean(blocker)}
                  title={blocker ?? undefined}
                  className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand font-bold text-white shadow-lg shadow-brand/20 transition hover:bg-brand-600 disabled:opacity-40 disabled:shadow-none"
                >
                  {blocker ? <Lock className="size-4" /> : <Rocket className="size-4" />} Accept & convert to project
                </motion.button>
                )
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 leading-relaxed text-navy/85">{children}</dd>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        {icon} {label}
      </p>
      <p className="mt-0.5 text-sm font-bold">{value}</p>
    </div>
  );
}
