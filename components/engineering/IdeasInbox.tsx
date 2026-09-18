"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  Copy,
  Lightbulb,
  Download,
  Eye,
  FileText,
  Loader2,
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
import { IDEA_STATUSES, convertIdea, updateIdea, useIdeas, type FeeState, type Idea, type IdeaStatus } from "@/lib/ideas";
import { errorMessage } from "@/lib/api";
import { activeLeads, useStaff, useStaffUsers } from "@/lib/staff";
import { cn, formatDate, initials, relativeDay } from "@/lib/format";
import { formatBytes, openRemoteFile } from "@/lib/files";
import type { Notify } from "../PortalApp";
import { apiPath, type StaffRole } from "./helpers";
import QuotePanel from "./QuotePanel";
import PaymentPanel from "./PaymentPanel";
import { FEE_STATES, REFUND_STATES, feeState, paidPayment, paymentBlocker, useStaffPayments } from "@/lib/wallet";

type Filter = IdeaStatus | "ALL";

const PAYMENT_FILTERS: { key: FeeState | "ALL"; label: string }[] = [
  { key: "ALL", label: "Any fee state" },
  { key: "AWAITING_CONFIRMATION", label: "Transfer to confirm" },
  { key: "PAID", label: "Fee paid" },
  { key: "UNPAID", label: "Fee unpaid" },
  { key: "PENDING", label: "Paying now" },
  { key: "FAILED", label: "Payment failed" },
];

/** Text the client hasn't filled in yet. Draft applications arrive half empty. */
const orBlank = (value: string | null | undefined, fallback = "Not filled in yet.") => (value && value.trim() ? value : fallback);

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
  initialSelectedId?: number | null;
}) {
  const me = useStaff();
  const isAdmin = me.role === "admin";
  const [filter, setFilter] = useState<Filter>(initialFilter ?? "ALL");
  const [payment, setPayment] = useState<FeeState | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId ?? null);

  // The server does the searching, so wait until they stop typing.
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { ideas, loading, error, refresh } = useIdeas({
    status: filter === "ALL" ? undefined : filter,
    q: q || undefined,
    payment: payment === "ALL" ? undefined : payment,
    includeDrafts: isAdmin && filter === "DRAFT" ? true : undefined,
  });
  // Admins get the count of transfers waiting from the payments queue; its counts are always
  // for the whole queue, so we ask for the smallest slice.
  const { counts } = useStaffPayments({ status: "AWAITING_CONFIRMATION" }, isAdmin);
  const toConfirm = counts?.awaitingConfirmation ?? 0;

  const selected = ideas.find((i) => i.id === selectedId);
  const filters = ["ALL", ...(Object.keys(IDEA_STATUSES) as IdeaStatus[]).filter((k) => k !== "DRAFT"), ...(isAdmin ? ["DRAFT" as const] : [])] as Filter[];

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
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by idea, name, reference or location"
            aria-label="Search ideas"
            className="h-full w-full bg-transparent text-sm outline-none"
          />
          {loading && <Loader2 className="size-4 shrink-0 animate-spin text-brand" />}
        </div>
        <select
          value={payment}
          onChange={(e) => setPayment(e.target.value as FeeState | "ALL")}
          aria-label="Filter by commitment fee"
          className="h-11 rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-brand"
        >
          {PAYMENT_FILTERS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition", filter === f ? "bg-navy text-white" : "bg-white text-muted hover:text-navy")}
          >
            {f === "ALL" ? "All" : f === "DRAFT" ? "Unfinished drafts" : IDEA_STATUSES[f].label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted" role="status" aria-live="polite">
        {loading ? "Loading ideas…" : `${ideas.length} idea${ideas.length === 1 ? "" : "s"}${q ? ` matching “${q}”` : ""}`}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        {/* list */}
        <ul className={cn("space-y-2.5", selected && "hidden lg:block")}>
          <AnimatePresence initial={false}>
            {ideas.map((idea, i) => (
              <motion.li key={idea.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                <button
                  onClick={() => {
                    setSelectedId(idea.id);
                    // Opening a new idea marks it as being looked at.
                    if (idea.status === "NEW") void updateIdea(idea.id, { status: "REVIEWING" }).catch(() => {});
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
                        {orBlank(idea.title, "Untitled idea")}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {orBlank(idea.name, "No name yet")}
                        {idea.location ? ` · ${idea.location}` : ""}
                      </p>
                    </div>
                    <StatusPill status={idea.status} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-navy/75">{orBlank(idea.problem)}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span className="font-mono">{idea.ref}</span>
                    <FeeBadge idea={idea} />
                    {idea.category && <span>{idea.category}</span>}
                    {idea.budget && <span>{idea.budget}</span>}
                    {idea.attachment && (
                      <span className="flex items-center gap-1 font-bold text-navy">
                        <Paperclip className="size-3" /> PDF
                      </span>
                    )}
                    <span className="ml-auto">{savedLabel(idea)}</span>
                  </div>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>

          {loading && ideas.length === 0 && (
            <li className="rounded-2xl border border-dashed border-line bg-white py-14 text-center text-sm text-muted" role="status" aria-live="polite">
              <Loader2 className="mx-auto mb-2 size-6 animate-spin text-brand" /> Loading the inbox…
            </li>
          )}
          {!loading && error && (
            <li className="rounded-2xl border border-line bg-white py-12 text-center" role="alert">
              <AlertTriangle className="mx-auto size-7 text-danger" />
              <p className="mt-2 text-sm font-bold">We couldn&apos;t load the inbox.</p>
              <p className="mt-1 px-4 text-sm text-muted">{error}</p>
              <button onClick={() => void refresh()} className="mt-3 rounded-full border border-line px-4 py-2 text-sm font-bold hover:border-navy">
                Try again
              </button>
            </li>
          )}
          {!loading && !error && ideas.length === 0 && (
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

function savedLabel(idea: Idea) {
  if (idea.status === "DRAFT") {
    const at = idea.lastSavedAt ?? idea.createdAt;
    return at ? `saved ${relativeDay(at).toLowerCase()}` : "not saved yet";
  }
  const at = idea.submittedAt ?? idea.createdAt;
  return at ? relativeDay(at) : "—";
}

function FeeBadge({ idea }: { idea: Idea }) {
  const refund = paidPayment(idea)?.refund;
  const meta = refund && refund.status !== "NONE" && refund.status !== "REFUNDED" ? REFUND_STATES[refund.status] : FEE_STATES[feeState(idea)];
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", meta.className)}>{meta.label}</span>;
}

function StatusPill({ status }: { status: IdeaStatus }) {
  return <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", IDEA_STATUSES[status].className)}>{IDEA_STATUSES[status].label}</span>;
}

function IdeaDetail({ idea, role, notify, onBack, onOpenProject }: { idea: Idea; role: StaffRole; notify: Notify; onBack: () => void; onOpenProject: (code: string) => void }) {
  const me = useStaff();
  const [notes, setNotes] = useState(idea.notes ?? "");
  const [converting, setConverting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const leadChoices = activeLeads(useStaffUsers());
  const [leadId, setLeadId] = useState<number | "">("");
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  });

  const client = idea.name ?? "the client";
  // Only a hint: the server refuses with a 409 if it disagrees.
  const blocker = paymentBlocker(idea);
  // activeLeads() only ever returns leads and admins, so this covers the whole list.
  const preferredLead = leadChoices.find((u) => u.role === "lead") ?? leadChoices.find((u) => u.role === "admin");
  const chosenLead = leadId === "" ? preferredLead?.id ?? "" : leadId;

  const run = async (working: string, action: () => Promise<unknown>, done: () => void) => {
    if (busy) return;
    setBusy(true);
    setStatus(working);
    try {
      await action();
      done();
      setStatus("");
    } catch (e) {
      const message = errorMessage(e);
      setStatus(message);
      notify(message, "info");
    } finally {
      setBusy(false);
    }
  };

  const saveNotes = () => {
    if (notes === (idea.notes ?? "")) return;
    void updateIdea(idea.id, { notes: notes.trim() || null }).catch((e) => notify(errorMessage(e), "info"));
  };

  const changeStatus = (next: IdeaStatus) => {
    if (next === idea.status || busy) return;
    if (next === "DECLINED") {
      const paid = paidPayment(idea);
      const warning = paid && paid.refund.status === "NONE" ? ` The commitment fee will be queued for a full refund.` : "";
      if (!window.confirm(`Decline ${idea.title ?? idea.ref}?${warning}`)) return;
      // The server queues the refund itself when the fee was paid.
      return void run("Declining the idea…", () => updateIdea(idea.id, { status: "DECLINED" }), () => notify("Idea declined.", "info"));
    }
    if (next !== "NEW" && next !== "REVIEWING" && next !== "QUOTE_SENT") return;
    void run(
      "Updating the idea…",
      () => updateIdea(idea.id, { status: next }),
      () => notify(next === "QUOTE_SENT" ? `Marked as quote sent to ${client}.` : `Status changed to ${IDEA_STATUSES[next].label}.`, "info"),
    );
  };

  const convert = () => {
    if (chosenLead === "") return notify("Choose the project lead first.", "info");
    void run(
      "Registering the project…",
      async () => {
        const result = await convertIdea(idea.id, { leadId: chosenLead, targetDate });
        notify(`Project ${result.projectCode} created. The Project ID was emailed to ${client}.`);
      },
      () => setConverting(false),
    );
  };

  const attachment = idea.attachment;

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
              {idea.ref} ·{" "}
              {idea.status === "DRAFT"
                ? `draft saved ${idea.lastSavedAt ? formatDate(idea.lastSavedAt) : "—"}${idea.source === "walk_in" ? " · started at a centre" : ""}`
                : `submitted ${idea.submittedAt ? formatDate(idea.submittedAt) : "—"}`}
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold">{orBlank(idea.title, "Untitled idea")}</h2>
            <p className="text-sm text-muted">{[idea.category, idea.platforms.join(", ")].filter(Boolean).join(" · ") || "No category yet"}</p>
          </div>
          <StatusPill status={idea.status} />
        </div>

        <p role="status" aria-live="polite" className={cn("mt-3 flex items-center gap-2 text-xs text-muted", !status && "sr-only")}>
          {busy && <Loader2 className="size-3.5 animate-spin text-brand" />}
          {status}
        </p>

        {/* contact */}
        <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-mist p-4 sm:flex-row sm:items-center">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-navy font-display font-bold text-white">{idea.name ? initials(idea.name) : "?"}</span>
          <div className="grid flex-1 gap-1.5 text-sm sm:grid-cols-2">
            <p className="font-bold sm:col-span-2">{orBlank(idea.name, "Name not given yet")}</p>
            <a href={`mailto:${idea.email}`} className="flex items-center gap-2 text-navy/80 hover:text-brand-700">
              <Mail className="size-4 text-muted" /> {idea.email}
            </a>
            {idea.phone && (
              <a href={`tel:${idea.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 text-navy/80 hover:text-brand-700">
                <Phone className="size-4 text-muted" /> {idea.phone}
              </a>
            )}
            {idea.organisation && (
              <span className="flex items-center gap-2 text-navy/80">
                <Building2 className="size-4 text-muted" /> {idea.organisation}
              </span>
            )}
            {idea.location && (
              <span className="flex items-center gap-2 text-navy/80">
                <MapPin className="size-4 text-muted" /> {idea.location}
              </span>
            )}
          </div>
        </div>

        {attachment && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-line p-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger">
              <FileText className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">{attachment.name}</span>
              <span className="block text-xs text-muted">
                PDF brief · {formatBytes(attachment.size)}
              </span>
            </span>
            {(["view", "download"] as const).map((mode) => (
              <button
                key={mode}
                onClick={async () => {
                  const path = apiPath(attachment.url);
                  const ok = path ? await openRemoteFile(path, attachment.name, mode) : false;
                  if (!ok) notify("We couldn't open that file. Please try again.", "info");
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
          <Section label="Problem">{orBlank(idea.problem)}</Section>
          <Section label="Target users">{orBlank(idea.targetUsers)}</Section>
          <Section label="Key features">{orBlank(idea.features)}</Section>
        </dl>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Fact icon={<Wallet className="size-4" />} label="Budget" value={orBlank(idea.budget, "Not set")} />
          <Fact icon={<CalendarClock className="size-4" />} label="Timeline" value={orBlank(idea.timeline, "Not set")} />
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
          onBlur={saveNotes}
          rows={2}
          placeholder="Feasibility, suggested stack, call notes… (never shown to the client)"
          className="mt-1.5 w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
        />

        <PaymentPanel idea={idea} notify={notify} />

        {idea.status !== "DRAFT" && <QuotePanel idea={idea} notify={notify} />}

        {/* actions */}
        {idea.status === "DRAFT" ? (
          <p className="mt-5 rounded-xl bg-mist px-4 py-3 text-sm text-muted">
            This application isn&apos;t submitted yet. It reaches the inbox once the client finishes it and pays the commitment fee.
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
                  navigator.clipboard?.writeText(idea.projectCode ?? "").catch(() => {});
                  notify("Project ID copied.", "info");
                }}
                className="rounded-full bg-white p-2.5 text-navy shadow-sm"
                aria-label="Copy Project ID"
              >
                <Copy className="size-4" />
              </button>
              <button onClick={() => onOpenProject(idea.projectCode as string)} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy-700">
                Open project
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-5 text-sm font-bold">Status</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["REVIEWING", "QUOTE_SENT", "DECLINED"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  disabled={busy}
                  title={s === "QUOTE_SENT" && blocker ? blocker : undefined}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-xs font-bold transition disabled:opacity-50",
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
                        <select
                          value={chosenLead}
                          onChange={(e) => setLeadId(e.target.value ? Number(e.target.value) : "")}
                          className="mt-1 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal outline-none focus:border-brand"
                        >
                          {leadChoices.length === 0 && <option value="">No project leads available</option>}
                          {leadChoices.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-bold">
                        Target delivery
                        <input
                          type="date"
                          value={targetDate}
                          onChange={(e) => setTargetDate(e.target.value)}
                          className="mt-1 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal outline-none focus:border-brand"
                        />
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setConverting(false)} disabled={busy} className="h-11 flex-1 rounded-xl border border-line bg-white text-sm font-bold text-muted disabled:opacity-50">
                        Cancel
                      </button>
                      <button
                        onClick={convert}
                        disabled={busy || !targetDate || chosenLead === ""}
                        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-40"
                      >
                        {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} Create project
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : role !== "admin" ? (
                <p key="note" className="mt-5 rounded-xl bg-mist px-4 py-3 text-sm text-muted">
                  Only an admin can register this idea as a project. Mark it as <b>Quote sent</b> and let an admin know.
                </p>
              ) : (
                <motion.button
                  key="btn"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setConverting(true)}
                  disabled={busy || idea.status === "DECLINED" || Boolean(blocker)}
                  title={blocker ?? undefined}
                  className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand font-bold text-white shadow-lg shadow-brand/20 transition hover:bg-brand-600 disabled:opacity-40 disabled:shadow-none"
                >
                  {blocker ? <Lock className="size-4" /> : <Rocket className="size-4" />} Accept & convert to project
                </motion.button>
              )}
            </AnimatePresence>
            {me.role === "admin" && blocker && <p className="mt-2 text-xs text-muted">{blocker}</p>}
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
