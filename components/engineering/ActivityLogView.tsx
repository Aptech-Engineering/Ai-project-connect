"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Bot, ChevronLeft, ChevronRight, Download, History, Loader2, Search, UserRound, Wrench } from "lucide-react";
import { query } from "@/lib/api";
import { openRemoteFile } from "@/lib/files";
import { useActivity } from "@/lib/store";
import { cn, formatDate } from "@/lib/format";
import type { Activity } from "@/lib/types";

const ACTOR_TYPES = {
  staff: { label: "Staff", icon: Wrench, className: "bg-blue-soft text-navy" },
  client: { label: "Client", icon: UserRound, className: "bg-teal-soft text-teal-700" },
  system: { label: "System", icon: Bot, className: "bg-mist text-muted" },
} as const;

type ActorType = keyof typeof ACTOR_TYPES;

/**
 * One row of /admin/activity. The shared `Activity` type only covers the four
 * fields every panel uses; the admin log also carries who acted, the project and the IP.
 */
type LogEntry = Activity & {
  actorType?: ActorType;
  projectCode?: string | null;
  projectTitle?: string | null;
  ip?: string | null;
};

const actorMeta = (e: LogEntry) => ACTOR_TYPES[e.actorType ?? "system"] ?? ACTOR_TYPES.system;

/** Admin-wide audit trail. The server searches, orders and pages it. */
export default function ActivityLogView({ onOpenProject }: { onOpenProject: (code: string) => void }) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const { items, pages, total, loading, error } = useActivity({ q: q || undefined, page });
  const entries = items as LogEntry[];

  const groups = useMemo(() => {
    const byDay = new Map<string, LogEntry[]>();
    for (const e of entries) {
      const key = formatDate(e.at, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      const day = byDay.get(key);
      if (day) day.push(e);
      else byDay.set(key, [e]);
    }
    return [...byDay.entries()];
  }, [entries]);

  const runSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQ(search.trim());
    setPage(1);
  };

  const download = async () => {
    setDownloading(true);
    setDownloadError("");
    const ok = await openRemoteFile(`/admin/activity.csv${query({ q: q || undefined })}`, `activity-log-${new Date().toISOString().slice(0, 10)}.csv`, "download");
    if (!ok) setDownloadError("We couldn't download the log. Please try again.");
    setDownloading(false);
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Admin</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-3xl font-bold">
            <History className="size-7 text-brand" /> Activity log
          </h1>
          <p className="mt-1 text-muted">Every stage change, update, approval, sign-off, content and account change — who did it and when. Kept on the server.</p>
        </div>
        <button
          onClick={() => void download()}
          disabled={downloading || total === 0}
          className="flex items-center gap-2 self-start rounded-full border border-line bg-white px-4 py-2 text-sm font-bold transition hover:border-navy/30 disabled:opacity-40 sm:self-auto"
        >
          {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Export CSV{total ? ` (${total})` : ""}
        </button>
      </div>

      <form onSubmit={runSearch} className="mt-6 flex flex-col gap-2 sm:flex-row">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
          <Search className="size-4 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actions or people"
            aria-label="Search the activity log"
            className="h-full w-full bg-transparent text-sm outline-none"
          />
        </div>
        <button className="h-11 shrink-0 rounded-xl bg-navy px-5 text-sm font-bold text-white hover:bg-navy-700">Search</button>
        {q && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setQ("");
              setPage(1);
            }}
            className="h-11 shrink-0 rounded-xl border border-line px-4 text-sm font-bold text-muted hover:text-navy"
          >
            Clear
          </button>
        )}
      </form>

      <p className="mt-2 text-xs text-muted" role="status" aria-live="polite">
        {loading ? "Loading the log…" : `${total} entr${total === 1 ? "y" : "ies"}${q ? ` matching “${q}”` : ""}${pages > 1 ? ` · page ${page} of ${pages}` : ""}`}
      </p>
      {downloadError && (
        <p className="mt-2 text-xs font-bold text-danger" role="alert">
          {downloadError}
        </p>
      )}

      <div className="mt-4 space-y-5">
        {loading && (
          <div className="rounded-2xl border border-line bg-white py-14 text-center text-sm text-muted">
            <Loader2 className="mx-auto mb-2 size-6 animate-spin text-brand" /> Loading the activity log…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-line bg-white py-12 text-center" role="alert">
            <AlertTriangle className="mx-auto size-7 text-danger" />
            <p className="mt-2 text-sm font-bold">We couldn&apos;t load the activity log.</p>
            <p className="mt-1 text-sm text-muted">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-3 rounded-full border border-line px-4 py-2 text-sm font-bold hover:border-navy">
              Reload the page
            </button>
          </div>
        )}

        {!loading &&
          !error &&
          groups.map(([day, dayItems]) => (
            <section key={day}>
              <h2 className="sticky top-16 z-10 bg-mist py-1 text-xs font-bold uppercase tracking-wider text-muted lg:top-0">{day}</h2>
              <ol className="mt-2 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
                {dayItems.map((e, i) => {
                  const meta = actorMeta(e);
                  const Icon = meta.icon;
                  return (
                    <motion.li key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.02 }} className="flex gap-3 border-b border-line px-4 py-3 last:border-b-0">
                      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", meta.className)} title={meta.label}>
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{e.action}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {e.actor} · {new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          {e.projectCode && (
                            <>
                              {" · "}
                              <button onClick={() => onOpenProject(e.projectCode as string)} className="font-bold text-navy hover:underline">
                                {e.projectTitle ?? e.projectCode}
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

        {!loading && !error && entries.length === 0 && (
          <p className="rounded-2xl border border-dashed border-line bg-white py-14 text-center text-sm text-muted">
            {q ? "Nothing in the log matches that search." : "Nothing has been recorded yet."}
          </p>
        )}

        {!loading && !error && pages > 1 && (
          <nav className="flex items-center justify-between gap-2" aria-label="Activity log pages">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-line bg-white px-4 text-sm font-bold text-muted hover:text-navy disabled:opacity-40"
            >
              <ChevronLeft className="size-4" /> Newer
            </button>
            <span className="text-xs text-muted">
              Page {page} of {pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-line bg-white px-4 text-sm font-bold text-muted hover:text-navy disabled:opacity-40"
            >
              Older <ChevronRight className="size-4" />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
