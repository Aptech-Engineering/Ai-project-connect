"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Download, History, Search, UserRound, Wrench } from "lucide-react";
import { useActivityLog, useProjects } from "@/lib/store";
import { cn, formatDate } from "@/lib/format";
import type { ActivityEntry } from "@/lib/types";

const PAGE = 60;
const ACTOR_TYPES = {
  staff: { label: "Staff", icon: Wrench, className: "bg-blue-soft text-navy" },
  client: { label: "Clients", icon: UserRound, className: "bg-teal-soft text-teal-700" },
  system: { label: "System", icon: Bot, className: "bg-mist text-muted" },
} as const;

/** Admin-wide audit trail: stage changes, publishing, approvals, permission and content changes. */
export default function ActivityLogView({ onOpenProject }: { onOpenProject: (code: string) => void }) {
  const log = useActivityLog();
  const projects = useProjects();
  const titles = useMemo(() => Object.fromEntries(projects.map((p) => [p.code, p.title])), [projects]);

  // Project-level history recorded before the global log existed is merged in so nothing is missing.
  const entries = useMemo(() => {
    const seen = new Set(log.map((e) => `${e.at}|${e.action}`));
    const legacy: ActivityEntry[] = projects.flatMap((p) =>
      (p.activity ?? [])
        .filter((a) => !seen.has(`${a.at}|${a.action}`))
        .map((a) => ({ id: `${p.code}-${a.id}`, at: a.at, actor: a.actor, action: a.action, projectCode: p.code, actorType: a.actor.includes("(Client)") ? "client" : a.actor === "System" ? "system" : "staff" })),
    );
    return [...log, ...legacy].sort((a, b) => +new Date(b.at) - +new Date(a.at));
  }, [log, projects]);

  const [q, setQ] = useState("");
  const [type, setType] = useState<ActivityEntry["actorType"] | "ALL">("ALL");
  const [project, setProject] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const filtered = entries.filter((e) => {
    if (type !== "ALL" && e.actorType !== type) return false;
    if (project && e.projectCode !== project) return false;
    const day = e.at.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    const needle = q.trim().toLowerCase();
    return !needle || e.action.toLowerCase().includes(needle) || e.actor.toLowerCase().includes(needle);
  });
  const visible = filtered.slice(0, limit);
  const groups = visible.reduce<Record<string, ActivityEntry[]>>((acc, e) => {
    const key = formatDate(e.at, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    (acc[key] ??= []).push(e);
    return acc;
  }, {});

  const exportCsv = () => {
    const cell = (v: string) => {
      const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const rows = [["Time", "Actor type", "Actor", "Action", "Project ID", "Project"], ...filtered.map((e) => [e.at, e.actorType, e.actor, e.action, e.projectCode ?? "", e.projectCode ? titles[e.projectCode] ?? "" : ""])];
    const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Admin</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-3xl font-bold">
            <History className="size-7 text-brand" /> Activity log
          </h1>
          <p className="mt-1 text-muted">Every stage change, update, approval, sign-off, content and account change — who did it and when.</p>
        </div>
        <button onClick={exportCsv} disabled={!filtered.length} className="flex items-center gap-2 self-start rounded-full border border-line bg-white px-4 py-2 text-sm font-bold transition hover:border-navy/30 disabled:opacity-40 sm:self-auto">
          <Download className="size-4" /> Export CSV ({filtered.length})
        </button>
      </div>

      <div className="mt-6 grid gap-2 rounded-2xl border border-line bg-white p-3 shadow-sm md:grid-cols-[1.5fr_1fr_auto_auto]">
        <div className="flex h-10 items-center gap-2 rounded-xl border border-line px-3 focus-within:border-brand">
          <Search className="size-4 text-muted" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Search actions or people" aria-label="Search activity" className="w-full bg-transparent text-sm outline-none" />
        </div>
        <select value={project} onChange={(e) => { setProject(e.target.value); setLimit(PAGE); }} aria-label="Filter by project" className="h-10 rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-brand">
          <option value="">All projects & admin</option>
          {projects.map((p) => (
            <option key={p.code} value={p.code}>
              {p.title}
            </option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="h-10 rounded-xl border border-line px-3 text-sm outline-none focus:border-brand" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="h-10 rounded-xl border border-line px-3 text-sm outline-none focus:border-brand" />
      </div>
      <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
        {(["ALL", "staff", "client", "system"] as const).map((t) => (
          <button key={t} onClick={() => setType(t)} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold", type === t ? "bg-navy text-white" : "bg-white text-muted hover:text-navy")}>
            {t === "ALL" ? "Everyone" : ACTOR_TYPES[t].label} <span className="opacity-60">{t === "ALL" ? entries.length : entries.filter((e) => e.actorType === t).length}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-5">
        {Object.entries(groups).map(([day, items]) => (
          <section key={day}>
            <h2 className="sticky top-16 z-10 bg-mist py-1 text-xs font-bold uppercase tracking-wider text-muted lg:top-0">{day}</h2>
            <ol className="mt-2 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
              {items.map((e, i) => {
                const meta = ACTOR_TYPES[e.actorType];
                const Icon = meta.icon;
                return (
                  <motion.li key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.02 }} className="flex gap-3 border-b border-line px-4 py-3 last:border-b-0">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", meta.className)}>
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{e.action}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {e.actor} · {new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        {e.projectCode && (
                          <>
                            {" · "}
                            <button onClick={() => onOpenProject(e.projectCode!)} className="font-bold text-navy hover:underline">
                              {titles[e.projectCode] ?? e.projectCode}
                            </button>
                          </>
                        )}
                      </p>
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          </section>
        ))}
        {filtered.length === 0 && <p className="rounded-2xl border border-dashed border-line bg-white py-14 text-center text-sm text-muted">No activity matches these filters.</p>}
        {filtered.length > limit && (
          <button onClick={() => setLimit((l) => l + PAGE)} className="h-11 w-full rounded-xl border border-line bg-white text-sm font-bold text-muted hover:text-navy">
            Show more ({filtered.length - limit} left)
          </button>
        )}
      </div>
    </div>
  );
}
