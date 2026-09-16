"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ExternalLink, Flag } from "lucide-react";
import { clientUpdates } from "@/lib/data";
import { cn, initials, relativeDay, shortDate } from "@/lib/format";
import type { Project, Update } from "@/lib/types";

const INITIAL = 4;

export default function UpdatesFeed({ project }: { project: Project }) {
  const [showAll, setShowAll] = useState(false);
  const visible = clientUpdates(project);
  const updates = showAll ? visible : visible.slice(0, INITIAL);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="rounded-3xl border border-line bg-white p-5 shadow-sm sm:p-7"
    >
      <div className="flex items-center justify-between">
        <h4 className="font-display text-lg font-bold">Latest updates</h4>
        <span className="rounded-full bg-mist px-3 py-1 text-xs font-bold text-muted">{visible.length} updates</span>
      </div>

      <ol className="relative mt-6">
        <span className="absolute bottom-3 left-[7px] top-3 w-0.5 bg-line" aria-hidden />
        <AnimatePresence initial={false}>
          {updates.map((u, i) => (
            <motion.li
              key={u.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ delay: i < INITIAL ? 0.3 + i * 0.08 : 0 }}
              className="relative pb-7 pl-8 last:pb-0"
            >
              <span
                className={cn(
                  "absolute left-0 top-1.5 size-4 rounded-full border-[3px] border-white shadow",
                  i === 0 ? "bg-brand" : "bg-teal",
                )}
              >
                {i === 0 && <span className="absolute inset-0 animate-ping rounded-full bg-brand/50" />}
              </span>
              <UpdateItem update={u} latest={i === 0} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>

      {visible.length > INITIAL && (
        <button
          onClick={() => setShowAll((s) => !s)}
          className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-sm font-bold text-muted transition hover:border-navy/30 hover:text-navy"
        >
          {showAll ? "Show fewer" : `Show all ${visible.length} updates`}
          <ChevronDown className={cn("size-4 transition", showAll && "rotate-180")} />
        </button>
      )}

    </motion.div>
  );
}

function UpdateItem({ update: u, latest }: { update: Update; latest: boolean }) {
  return (
    <article>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <time className="font-bold text-muted" dateTime={u.date}>
          {shortDate(u.date)}
        </time>
        <span className="text-muted/60">·</span>
        <span className="text-muted">{relativeDay(u.date)}</span>
        {latest && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase text-white">New</span>}
        {u.kind === "stage" && (
          <span className="flex items-center gap-1 rounded-full bg-blue-soft px-2 py-0.5 text-[10px] font-bold uppercase text-navy">
            <Flag className="size-3" /> Stage change
          </span>
        )}
      </div>
      <h5 className="mt-1.5 font-display font-semibold">{u.title}</h5>
      <p className="mt-1 text-sm leading-relaxed text-navy/75">{u.body}</p>

      {u.screenshot && <Screenshot kind={u.screenshot} />}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-xs text-muted">
          <span className="grid size-6 place-items-center rounded-full bg-navy text-[9px] font-bold text-white">
            {initials(u.author.name)}
          </span>
          {u.author.name} · {u.author.role}
        </span>
        {u.demoLink && (
          <a
            href={u.demoLink}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.preventDefault()}
            title="Demo links open the staging site (mock)"
            className="flex items-center gap-1 rounded-full border border-teal/30 bg-teal-soft px-2.5 py-1 text-xs font-bold text-teal-700 hover:border-teal"
          >
            Try the demo <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </article>
  );
}

/** Illustrative screenshot thumbnails built in CSS so the mock needs no image assets. */
function Screenshot({ kind }: { kind: NonNullable<Update["screenshot"]> }) {
  return (
    <motion.div
      whileHover={{ scale: 1.015 }}
      className="mt-3 overflow-hidden rounded-xl border border-line bg-gradient-to-br from-navy to-navy-700 p-3 sm:max-w-md"
    >
      <div className="flex gap-1 pb-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 rounded-full bg-white/30" />
        ))}
      </div>
      {kind === "payment" && (
        <div className="grid grid-cols-[1.4fr_1fr] gap-2">
          <div className="space-y-1.5 rounded-lg bg-white p-2.5">
            <div className="h-2 w-16 rounded bg-navy/80" />
            <div className="h-6 rounded border border-line" />
            <div className="grid grid-cols-2 gap-1.5">
              <div className="h-6 rounded border border-line" />
              <div className="h-6 rounded border border-line" />
            </div>
            <div className="h-6 rounded bg-brand" />
          </div>
          <div className="space-y-1.5 rounded-lg bg-white/10 p-2.5">
            <div className="h-2 w-10 rounded bg-white/60" />
            <div className="h-1.5 w-full rounded bg-white/25" />
            <div className="h-1.5 w-3/4 rounded bg-white/25" />
            <div className="mt-3 h-4 w-14 rounded bg-teal" />
          </div>
        </div>
      )}
      {kind === "onboarding" && (
        <div className="flex justify-center gap-2">
          {["bg-brand", "bg-teal", "bg-white"].map((c, i) => (
            <div key={i} className="w-20 space-y-1.5 rounded-lg bg-white p-2">
              <div className={`mx-auto size-6 rounded-full ${c === "bg-white" ? "bg-navy" : c}`} />
              <div className="mx-auto h-1.5 w-12 rounded bg-navy/70" />
              <div className="h-4 rounded border border-line" />
              <div className={`h-4 rounded ${i === 2 ? "bg-brand" : "bg-mist"}`} />
            </div>
          ))}
        </div>
      )}
      {kind === "dashboard" && (
        <div className="grid grid-cols-3 gap-2">
          {[70, 45, 85].map((h, i) => (
            <div key={i} className="rounded-lg bg-white p-2">
              <div className="h-1.5 w-8 rounded bg-muted/40" />
              <div className="mt-1 h-2.5 w-10 rounded bg-navy/80" />
              <div className="mt-2 flex h-10 items-end gap-0.5">
                {[h, h - 20, h + 10, h - 5, h + 15].map((v, j) => (
                  <span key={j} className={j === 4 ? "flex-1 rounded-sm bg-brand" : "flex-1 rounded-sm bg-teal/60"} style={{ height: `${Math.max(15, Math.min(100, v))}%` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {kind === "design" && (
        <div className="grid grid-cols-4 gap-2">
          {["Home", "Product", "Cart", "Checkout"].map((s, i) => (
            <div key={s} className="rounded-md bg-white p-1.5">
              <div className={`h-8 rounded ${["bg-brand/80", "bg-teal/70", "bg-blue-soft", "bg-navy/80"][i]}`} />
              <div className="mt-1 h-1 w-3/4 rounded bg-navy/40" />
              <div className="mt-0.5 h-1 w-1/2 rounded bg-navy/20" />
              <p className="mt-1 text-center text-[7px] font-bold text-muted">{s}</p>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
