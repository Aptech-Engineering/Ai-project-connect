"use client";

import { useState } from "react";
import Link from "next/link";
import { errorMessage } from "@/lib/api";
import {
  createSchedule,
  deleteSavedView,
  deleteSchedule,
  saveView,
  updateSchedule,
  useSavedViews,
  useSchedules,
  type ReportSchedule,
  type SavedView,
} from "@/lib/analytics/api";
import { SCREENS } from "@/lib/analytics/screens";
import type { MeResponse, ScreenKey } from "@/lib/analytics/types";

/**
 * Saved views (spec 10.2) and scheduled reports (spec 10.3), both backed by
 * /api/analytics/views and /api/analytics/schedules.
 */
export function PanelsDrawer({
  panel,
  onClose,
  session,
  currentQuery,
  currentView,
  startSaving,
}: {
  panel: "views" | "reports";
  onClose: () => void;
  session: MeResponse;
  /** The dashboard's current query string, saved as-is. */
  currentQuery: string;
  currentView: ScreenKey;
  startSaving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-navy-950/40" onClick={onClose} aria-hidden />
      <div className="relative h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-navy">{panel === "views" ? "Saved views" : "Scheduled reports"}</h2>
          <button onClick={onClose} className="focus-ring rounded-lg px-2 py-1 text-muted hover:bg-mist" aria-label="Close">
            ✕
          </button>
        </div>
        {panel === "views" ? (
          <SavedViews session={session} currentQuery={currentQuery} currentView={currentView} startSaving={startSaving} onOpen={onClose} />
        ) : (
          <Reports session={session} currentView={currentView} currentQuery={currentQuery} />
        )}
      </div>
    </div>
  );
}

function SavedViews({
  session,
  currentQuery,
  currentView,
  startSaving,
  onOpen,
}: {
  session: MeResponse;
  currentQuery: string;
  currentView: ScreenKey;
  startSaving: boolean;
  onOpen: () => void;
}) {
  const { views, loading, error, refresh } = useSavedViews();
  const label = SCREENS.find((s) => s.key === currentView)?.label ?? "Overview";
  const [name, setName] = useState(`${label} — my view`);
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [open, setOpen] = useState(startSaving);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem("");
    try {
      await saveView(name.trim(), currentQuery, shared);
      await refresh();
      setOpen(false);
      setName(`${label} — my view`);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(view: SavedView) {
    setProblem("");
    try {
      await deleteSavedView(view.id);
      await refresh();
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-muted">This screen with its date range and filters, kept for next time.</p>

      {open ? (
        <form onSubmit={save} className="rounded-xl border border-line p-3">
          <label htmlFor="view-name" className="block text-xs font-medium text-navy">
            Name
          </label>
          <input
            id="view-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            autoFocus
            className="focus-ring mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm"
          />
          {session.user.role === "admin" && (
            <label className="mt-2 flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="focus-ring" />
              Share with everyone who has analytics access
            </label>
          )}
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={busy} className="focus-ring rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
              {busy ? "Saving…" : "Save this view"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="focus-ring rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-navy">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setOpen(true)} className="focus-ring rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white">
          Save the current view
        </button>
      )}

      {problem && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">{problem}</p>}

      {loading && !views && <p className="text-sm text-muted">Loading…</p>}
      {error && !loading && <p className="text-sm text-muted">{error}</p>}
      {views && views.length === 0 && <p className="text-sm text-muted">Nothing saved yet.</p>}

      <ul className="space-y-2">
        {views?.map((v) => (
          <li key={v.id} className="rounded-xl border border-line p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={v.url} onClick={onOpen} className="focus-ring block truncate text-sm font-medium text-navy hover:underline">
                  {v.name}
                </Link>
                <p className="mt-0.5 text-xs text-muted">
                  {SCREENS.find((s) => s.key === v.view)?.label ?? v.view}
                  {v.shared ? ` · shared by ${v.owner.name ?? "a colleague"}` : ""}
                </p>
              </div>
              {(v.mine || session.user.role === "admin") && (
                <button onClick={() => void remove(v)} className="focus-ring shrink-0 rounded-lg px-2 py-1 text-xs text-muted hover:text-danger">
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Reports({ session, currentView, currentQuery }: { session: MeResponse; currentView: ScreenKey; currentQuery: string }) {
  const { schedules, loading, error, refresh } = useSchedules();
  const label = SCREENS.find((s) => s.key === currentView)?.label ?? "Overview";
  const [name, setName] = useState(`${label} report`);
  const [frequency, setFrequency] = useState<ReportSchedule["frequency"]>("weekly");
  const [format, setFormat] = useState<ReportSchedule["format"]>("pdf");
  const [recipients, setRecipients] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [open, setOpen] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem("");
    try {
      await createSchedule({
        name: name.trim(),
        view: currentView,
        frequency,
        format,
        recipients: recipients
          .split(/[,\s]+/)
          .map((r: string) => r.trim())
          .filter(Boolean),
        query: currentQuery,
      });
      await refresh();
      setOpen(false);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s: ReportSchedule) {
    setProblem("");
    try {
      await updateSchedule(s.id, { active: !s.active });
      await refresh();
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  async function remove(s: ReportSchedule) {
    setProblem("");
    try {
      await deleteSchedule(s.id);
      await refresh();
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-muted">This screen, emailed to staff with analytics access on a schedule.</p>

      {open ? (
        <form onSubmit={create} className="space-y-2 rounded-xl border border-line p-3">
          <div>
            <label htmlFor="report-name" className="block text-xs font-medium text-navy">
              Name
            </label>
            <input
              id="report-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              autoFocus
              className="focus-ring mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label htmlFor="report-frequency" className="block text-xs font-medium text-navy">
                How often
              </label>
              <select
                id="report-frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as ReportSchedule["frequency"])}
                className="focus-ring mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="flex-1">
              <label htmlFor="report-format" className="block text-xs font-medium text-navy">
                Format
              </label>
              <select
                id="report-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as ReportSchedule["format"])}
                className="focus-ring mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm"
              >
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
                <option value="xlsx">Excel</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="report-recipients" className="block text-xs font-medium text-navy">
              Send to
            </label>
            <input
              id="report-recipients"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              required
              placeholder="name@aptech.test, other@aptech.test"
              className="focus-ring mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[11px] text-muted">Staff accounts with analytics access only.</p>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={busy} className="focus-ring rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
              {busy ? "Scheduling…" : "Schedule it"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="focus-ring rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-navy">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setOpen(true)} className="focus-ring rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white">
          Schedule this screen
        </button>
      )}

      {problem && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">{problem}</p>}

      {loading && !schedules && <p className="text-sm text-muted">Loading…</p>}
      {error && !loading && <p className="text-sm text-muted">{error}</p>}
      {schedules && schedules.length === 0 && <p className="text-sm text-muted">No reports scheduled yet.</p>}

      <ul className="space-y-2">
        {schedules?.map((s) => (
          <li key={s.id} className="rounded-xl border border-line p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-navy">{s.name}</p>
                <p className="mt-0.5 text-xs capitalize text-muted">
                  {s.frequency} · {s.format.toUpperCase()} · {SCREENS.find((x) => x.key === s.view)?.label ?? s.view}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  To {s.recipients.join(", ")}
                  {s.nextRunAt ? ` · next ${new Date(s.nextRunAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : " · paused"}
                </p>
              </div>
              {(s.mine || session.user.role === "admin") && (
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button onClick={() => void toggle(s)} className="focus-ring rounded-lg px-2 py-1 text-xs text-muted hover:text-navy">
                    {s.active ? "Pause" : "Resume"}
                  </button>
                  <button onClick={() => void remove(s)} className="focus-ring rounded-lg px-2 py-1 text-xs text-muted hover:text-danger">
                    Delete
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
