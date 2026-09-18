"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, CheckCheck, GraduationCap, Mail, MessageCircle, MessageSquareText, Smartphone } from "lucide-react";
import { useCatalog } from "@/lib/catalog";
import { postTeamReply } from "@/lib/actions";
import { updateLead, useLeads, useOutbox, useProjects } from "@/lib/store";
import { cn, relativeDay } from "@/lib/format";
import type { LeadStatus, Notice } from "@/lib/types";
import type { Notify } from "../PortalApp";
import { actingAs, type StaffRole } from "./helpers";
import { canViewProject, useStaff } from "@/lib/staff";

/* ---------- Client messages ---------- */

export function MessagesInbox({ role, notify, onOpen }: { role: StaffRole; notify: Notify; onOpen: (code: string) => void }) {
  const me = useStaff();
  const projects = useProjects().filter((p) => canViewProject(me, p));
  const threads = projects
    .filter((p) => (p.messages ?? []).length > 0)
    .map((p) => {
      const msgs = p.messages!;
      const last = msgs[msgs.length - 1];
      return { project: p, last, needsReply: last.from === "client" };
    })
    .sort((a, b) => Number(b.needsReply) - Number(a.needsReply) || +new Date(b.last.at) - +new Date(a.last.at));

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Client messages</h1>
      <p className="mt-1 text-muted">Questions clients send from their portal. Replies are emailed to them and shown in their portal.</p>
      <ul className="mt-6 space-y-3">
        {threads.map(({ project, last, needsReply }, i) => (
          <motion.li key={project.code} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <QuickReply project={project} last={last} needsReply={needsReply} role={role} notify={notify} onOpen={onOpen} />
          </motion.li>
        ))}
        {threads.length === 0 && <Empty icon={<MessageCircle className="size-8" />} text="No client messages yet." />}
      </ul>
    </div>
  );
}

function QuickReply({
  project,
  last,
  needsReply,
  role,
  notify,
  onOpen,
}: {
  project: ReturnType<typeof useProjects>[number];
  last: NonNullable<ReturnType<typeof useProjects>[number]["messages"]>[number];
  needsReply: boolean;
  role: StaffRole;
  notify: Notify;
  onOpen: (code: string) => void;
}) {
  const me = useStaff();
  const [text, setText] = useState("");
  return (
    <div className={cn("rounded-2xl border bg-white p-5 shadow-sm", needsReply ? "border-brand/40" : "border-line")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => onOpen(project.code)} className="text-left">
          <span className="font-display font-semibold hover:underline">{project.title}</span>
          <span className="ml-2 text-xs text-muted">
            {project.client.name} · <span className="font-mono">{project.code}</span>
          </span>
        </button>
        {needsReply ? (
          <span className="rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold uppercase text-white">Needs reply</span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-teal-soft px-2.5 py-1 text-[10px] font-bold uppercase text-teal-700">
            <CheckCheck className="size-3" /> Answered
          </span>
        )}
      </div>
      <p className={cn("mt-3 rounded-xl px-3.5 py-2.5 text-sm", last.from === "client" ? "bg-mist" : "bg-navy text-white")}>{last.text}</p>
      <p className="mt-1 text-xs text-muted">
        {last.author} · {relativeDay(last.at)} · {project.messages!.length} message{project.messages!.length === 1 ? "" : "s"}
      </p>
      {needsReply && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            postTeamReply(project, actingAs(me), text.trim());
            setText("");
            notify(`Reply sent to ${project.client.name}.`);
          }}
          className="mt-3 flex gap-2"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a plain-language reply…"
            className="h-10 flex-1 rounded-xl border border-line px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
          />
          <button disabled={!text.trim()} className="rounded-xl bg-navy px-4 text-sm font-bold text-white disabled:opacity-40">
            Reply
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
  const leads = useLeads();
  const { courses, technologies } = useCatalog();
  const [filter, setFilter] = useState<LeadStatus | "ALL">("ALL");
  const list = leads.filter((l) => filter === "ALL" || l.status === filter);
  const enrolled = leads.filter((l) => l.status === "ENROLLED").length;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Course leads</h1>
      <p className="mt-1 text-muted">Created when clients tap &ldquo;Request info&rdquo; or &ldquo;Enrol&rdquo; on a stack item. For course counsellors.</p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <MiniStat label="Total leads" value={leads.length} />
        <MiniStat label="Waiting for contact" value={leads.filter((l) => l.status === "NEW").length} tone="brand" />
        <MiniStat label="Conversion" value={`${leads.length ? Math.round((enrolled / leads.length) * 100) : 0}%`} tone="teal" />
      </div>

      <div className="no-scrollbar mt-5 flex gap-1.5 overflow-x-auto">
        {(["ALL", ...Object.keys(LEAD_STATUSES)] as (LeadStatus | "ALL")[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold", filter === f ? "bg-navy text-white" : "bg-white text-muted hover:text-navy")}
          >
            {f === "ALL" ? "All" : LEAD_STATUSES[f].label}
          </button>
        ))}
      </div>

      <ul className="mt-4 space-y-3">
        <AnimatePresence initial={false}>
          {list.map((l) => {
            const tech = technologies[l.techId];
            const course = courses[l.courseId];
            return (
              <motion.li key={l.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-navy font-display text-xs font-bold" style={{ color: tech?.color ?? "#F26B22" }}>
                    {tech?.mark ?? <GraduationCap className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display font-semibold">{l.clientName}</p>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", l.type === "enrol" ? "bg-teal-soft text-teal-700" : "bg-mist text-muted")}>
                        {l.type === "enrol" ? "Wants to enrol" : "Requested info"}
                      </span>
                      {l.source === "invite" && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase text-brand-700">Invited by {l.invitedBy}</span>}
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm">
                      <GraduationCap className="size-4 text-brand" /> {course?.title ?? "Course removed"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {l.projectCode ? (
                        <>
                          From {l.projectTitle} (<span className="font-mono">{l.projectCode}</span>) via {tech?.name ?? "stack panel"}
                        </>
                      ) : (
                        <>From the website courses section{l.contact ? ` · ${l.contact}` : ""}</>
                      )}{" "}
                      · {relativeDay(l.at)}
                    </p>
                    <input
                      defaultValue={l.notes}
                      onBlur={(e) => e.target.value !== (l.notes ?? "") && updateLead(l.id, { notes: e.target.value })}
                      placeholder="Add a follow-up note…"
                      className="mt-3 h-9 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-brand"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:w-44 sm:flex-col">
                    {(Object.keys(LEAD_STATUSES) as LeadStatus[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          updateLead(l.id, { status: s });
                          notify(`${l.clientName} marked as ${LEAD_STATUSES[s].label.toLowerCase()}.`, "info");
                        }}
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-xs font-bold transition",
                          l.status === s ? LEAD_STATUSES[s].className : "bg-mist text-muted hover:text-navy",
                        )}
                      >
                        {LEAD_STATUSES[s].label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
        {list.length === 0 && <Empty icon={<GraduationCap className="size-8" />} text="No course leads here." />}
      </ul>
    </div>
  );
}

/* ---------- Notification outbox (NT-01 to NT-03) ---------- */

export function Outbox() {
  const notices = useOutbox();
  const [audience, setAudience] = useState<Notice["audience"] | "ALL">("ALL");
  const list = notices.filter((n) => audience === "ALL" || n.audience === audience);

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Notifications</h1>
      <p className="mt-1 text-muted">
        Every email and SMS the platform would send. In this demo nothing leaves the browser; in production these go through the email and SMS gateway.
      </p>
      <div className="no-scrollbar mt-5 flex gap-1.5 overflow-x-auto">
        {(["ALL", "client", "staff", "counsellor"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAudience(a)}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold capitalize", audience === a ? "bg-navy text-white" : "bg-white text-muted hover:text-navy")}
          >
            {a === "ALL" ? "All" : `To ${a}s`} <span className="opacity-60">{a === "ALL" ? notices.length : notices.filter((n) => n.audience === a).length}</span>
          </button>
        ))}
      </div>
      <ul className="mt-4 space-y-2.5">
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
        {list.length === 0 && (
          <Empty icon={<BellRing className="size-8" />} text="No notifications yet. Publish an update, change a stage or submit an idea to see them here." />
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

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="list-none rounded-2xl border border-dashed border-line bg-white py-14 text-center text-sm text-muted">
      <span className="mx-auto mb-2 block w-fit text-line">{icon}</span>
      {text}
    </li>
  );
}
