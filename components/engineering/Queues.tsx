"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BellRing, CheckCheck, GraduationCap, Loader2, Mail, MessageCircle, MessageSquareText, RotateCw, Smartphone } from "lucide-react";
import { useCatalog } from "@/lib/catalog";
import { errorMessage } from "@/lib/api";
import { postTeamReply } from "@/lib/actions";
import { refreshLeads, refreshNotifications, refreshProjects, updateLead, useLeads, useMessageThreads, useNotifications, type MessageThread } from "@/lib/store";
import { cn, relativeDay } from "@/lib/format";
import type { CourseLead, LeadStatus, Notice } from "@/lib/types";
import type { Notify } from "../PortalApp";

/* ---------- shared bits ---------- */

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="list-none rounded-2xl border border-dashed border-line bg-white py-14 text-center text-sm text-muted">
      <span className="mx-auto mb-2 block w-fit text-line">{icon}</span>
      {text}
    </li>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <li className="list-none rounded-2xl border border-line bg-white py-14 text-center text-sm text-muted shadow-sm">
      <Loader2 className="mx-auto mb-2 size-6 animate-spin text-brand" />
      {label}
    </li>
  );
}

function Failed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <li role="alert" className="list-none rounded-2xl border border-danger/20 bg-danger-soft px-4 py-12 text-center">
      <AlertTriangle className="mx-auto size-6 text-danger" />
      <p className="mt-2 text-sm">{message}</p>
      <button onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-navy hover:border-navy/30">
        <RotateCw className="size-4" /> Try again
      </button>
    </li>
  );
}

/* ---------- Client messages ---------- */

export function MessagesInbox({ notify, onOpen }: { notify: Notify; onOpen: (code: string) => void }) {
  const { threads, loading, error } = useMessageThreads();

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Client messages</h1>
      <p className="mt-1 text-muted">Questions clients send from their portal. Replies are emailed to them and shown in their portal.</p>
      <ul className="mt-6 space-y-3" aria-live="polite" aria-busy={loading}>
        {error && threads.length === 0 ? (
          <Failed message={error} onRetry={() => void refreshProjects()} />
        ) : loading && threads.length === 0 ? (
          <Loading label="Loading conversations…" />
        ) : (
          threads.map((thread, i) => (
            <motion.li key={thread.projectCode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <QuickReply thread={thread} notify={notify} onOpen={onOpen} />
            </motion.li>
          ))
        )}
        {!loading && !error && threads.length === 0 && <Empty icon={<MessageCircle className="size-8" />} text="No client messages yet." />}
      </ul>
    </div>
  );
}

function QuickReply({ thread, notify, onOpen }: { thread: MessageThread; notify: Notify; onOpen: (code: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const last = thread.last;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await postTeamReply(thread.projectCode, text.trim());
      setText("");
      notify(`Reply sent to ${thread.clientName}.`);
    } catch (err) {
      notify(errorMessage(err), "info");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("rounded-2xl border bg-white p-5 shadow-sm", thread.needsReply ? "border-brand/40" : "border-line")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => onOpen(thread.projectCode)} className="text-left">
          <span className="font-display font-semibold hover:underline">{thread.projectTitle}</span>
          <span className="ml-2 text-xs text-muted">
            {thread.clientName} · <span className="font-mono">{thread.projectCode}</span>
          </span>
        </button>
        {thread.needsReply ? (
          <span className="rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold uppercase text-white">Needs reply</span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-teal-soft px-2.5 py-1 text-[10px] font-bold uppercase text-teal-700">
            <CheckCheck className="size-3" /> Answered
          </span>
        )}
      </div>
      {last && (
        <>
          <p className={cn("mt-3 rounded-xl px-3.5 py-2.5 text-sm", last.from === "client" ? "bg-mist" : "bg-navy text-white")}>{last.text}</p>
          <p className="mt-1 text-xs text-muted">
            {last.author} · {relativeDay(last.at)} · {thread.messageCount} message{thread.messageCount === 1 ? "" : "s"}
          </p>
        </>
      )}
      {thread.needsReply && (
        <form onSubmit={send} className="mt-3 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            aria-label={`Reply to ${thread.clientName}`}
            placeholder="Write a plain-language reply…"
            className="h-10 flex-1 rounded-xl border border-line px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 disabled:opacity-60"
          />
          <button disabled={!text.trim() || busy} className="flex items-center gap-1.5 rounded-xl bg-navy px-4 text-sm font-bold text-white disabled:opacity-40">
            {busy && <Loader2 className="size-4 animate-spin" />} Reply
          </button>
        </form>
      )}
    </div>
  );
}

/* ---------- Course leads (counsellor queue, LS-04) ---------- */

const LEAD_STATUSES: Record<LeadStatus, { label: string; className: string }> = {
  NEW: { label: "New", className: "bg-brand text-white" },
  CONTACTED: { label: "Contacted", className: "bg-blue-soft text-navy" },
  ENROLLED: { label: "Enrolled", className: "bg-teal text-white" },
  NOT_INTERESTED: { label: "Not interested", className: "bg-line text-muted" },
};

export function LeadsQueue({ notify }: { notify: Notify }) {
  const [filter, setFilter] = useState<LeadStatus | "ALL">("ALL");
  // The queue is filtered by the server; the totals below always count every lead.
  const { leads, stats, loading, error } = useLeads(filter === "ALL" ? undefined : filter);
  const total = stats?.total ?? 0;
  const waiting = stats?.waiting ?? 0;
  const conversion = stats?.conversionPercent ?? 0;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Course leads</h1>
      <p className="mt-1 text-muted">Created when clients tap &ldquo;Request info&rdquo; or &ldquo;Enrol&rdquo; on a stack item. For course counsellors.</p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <MiniStat label="Total leads" value={stats ? total : "—"} />
        <MiniStat label="Waiting for contact" value={stats ? waiting : "—"} tone="brand" />
        <MiniStat label="Conversion" value={stats ? `${conversion}%` : "—"} tone="teal" />
      </div>

      <div className="no-scrollbar mt-5 flex gap-1.5 overflow-x-auto">
        {(["ALL", ...Object.keys(LEAD_STATUSES)] as (LeadStatus | "ALL")[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold", filter === f ? "bg-navy text-white" : "bg-white text-muted hover:text-navy")}
          >
            {f === "ALL" ? "All" : LEAD_STATUSES[f].label}
          </button>
        ))}
      </div>

      <ul className="mt-4 space-y-3" aria-live="polite" aria-busy={loading}>
        {error && leads.length === 0 ? (
          <Failed message={error} onRetry={() => void refreshLeads()} />
        ) : loading && leads.length === 0 ? (
          <Loading label="Loading course leads…" />
        ) : (
          <AnimatePresence initial={false}>
            {leads.map((l) => (
              <LeadRow key={l.id} lead={l} notify={notify} />
            ))}
          </AnimatePresence>
        )}
        {!loading && !error && leads.length === 0 && <Empty icon={<GraduationCap className="size-8" />} text="No course leads here." />}
      </ul>
    </div>
  );
}

function LeadRow({ lead, notify }: { lead: CourseLead; notify: Notify }) {
  const { courses, technologies } = useCatalog();
  const [busy, setBusy] = useState(false);
  const tech = technologies[lead.techId];
  const course = courses[lead.courseId];

  const save = async (patch: { status?: LeadStatus; notes?: string }, message?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await updateLead(Number(lead.id), patch);
      if (message) notify(message, "info");
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("rounded-2xl border border-line bg-white p-5 shadow-sm", busy && "opacity-70")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-navy font-display text-xs font-bold" style={{ color: tech?.color ?? "#F26B22" }}>
          {tech?.mark ?? <GraduationCap className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display font-semibold">{lead.clientName}</p>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", lead.type === "enrol" ? "bg-teal-soft text-teal-700" : "bg-mist text-muted")}>
              {lead.type === "enrol" ? "Wants to enrol" : "Requested info"}
            </span>
            {lead.source === "invite" && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase text-brand-700">Invited by {lead.invitedBy}</span>}
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm">
            <GraduationCap className="size-4 text-brand" /> {course?.title ?? "Course removed"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {lead.projectCode ? (
              <>
                From {lead.projectTitle} (<span className="font-mono">{lead.projectCode}</span>) via {tech?.name ?? "stack panel"}
              </>
            ) : (
              <>From the website courses section{lead.contact ? ` · ${lead.contact}` : ""}</>
            )}{" "}
            · {relativeDay(lead.at)}
          </p>
          <input
            defaultValue={lead.notes}
            disabled={busy}
            aria-label={`Follow-up note for ${lead.clientName}`}
            onBlur={(e) => e.target.value !== (lead.notes ?? "") && void save({ notes: e.target.value })}
            placeholder="Add a follow-up note…"
            className="mt-3 h-9 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-brand disabled:opacity-60"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 sm:w-44 sm:flex-col">
          {(Object.keys(LEAD_STATUSES) as LeadStatus[]).map((s) => (
            <button
              key={s}
              disabled={busy}
              onClick={() => void save({ status: s }, `${lead.clientName} marked as ${LEAD_STATUSES[s].label.toLowerCase()}.`)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-40",
                lead.status === s ? LEAD_STATUSES[s].className : "bg-mist text-muted hover:text-navy",
              )}
            >
              {LEAD_STATUSES[s].label}
            </button>
          ))}
        </div>
      </div>
    </motion.li>
  );
}

/* ---------- Notification outbox (NT-01 to NT-03) ---------- */

export function Outbox() {
  const { notices, loading, error } = useNotifications();
  const [audience, setAudience] = useState<Notice["audience"] | "ALL">("ALL");
  const list = notices.filter((n) => audience === "ALL" || n.audience === audience);

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Notifications</h1>
      <p className="mt-1 text-muted">Every email and SMS the platform has sent, newest first, with who it went to and what it said.</p>
      <div className="no-scrollbar mt-5 flex gap-1.5 overflow-x-auto">
        {(["ALL", "client", "staff", "counsellor"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAudience(a)}
            aria-pressed={audience === a}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold capitalize", audience === a ? "bg-navy text-white" : "bg-white text-muted hover:text-navy")}
          >
            {a === "ALL" ? "All" : `To ${a}s`} <span className="opacity-60">{a === "ALL" ? notices.length : notices.filter((n) => n.audience === a).length}</span>
          </button>
        ))}
      </div>
      <ul className="mt-4 space-y-2.5" aria-live="polite" aria-busy={loading}>
        {error && notices.length === 0 ? (
          <Failed message={error} onRetry={() => void refreshNotifications()} />
        ) : loading && notices.length === 0 ? (
          <Loading label="Loading the notification log…" />
        ) : (
          <AnimatePresence initial={false}>
            {list.map((n) => (
              <motion.li key={n.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-4 rounded-2xl border border-line bg-white p-4 shadow-sm">
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-xl",
                    n.audience === "client" ? "bg-teal-soft text-teal-700" : n.audience === "counsellor" ? "bg-brand-soft text-brand-700" : "bg-blue-soft text-navy",
                  )}
                >
                  {n.channel === "sms" ? <Smartphone className="size-5" /> : n.channel === "email" ? <Mail className="size-5" /> : <MessageSquareText className="size-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">{n.subject}</p>
                    <span className="text-xs text-muted">{relativeDay(n.at)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {n.channel === "email+sms" ? "Email + SMS" : n.channel === "sms" ? "SMS" : "Email"} → {n.to}
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm text-navy/75">{n.body}</p>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        )}
        {!loading && !error && list.length === 0 && (
          <Empty icon={<BellRing className="size-8" />} text="Nothing here yet. Publish an update, change a stage or submit an idea to see them." />
        )}
      </ul>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string | number; tone?: "brand" | "teal" }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <p className={cn("font-display text-2xl font-bold", tone === "brand" && "text-brand-700", tone === "teal" && "text-teal-700")}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
