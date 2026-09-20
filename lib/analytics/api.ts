"use client";

/**
 * Data for the Analytics dashboard, straight from the PHP API (spec section 9).
 *
 * The screens were built against the documented envelope, so these hooks only
 * turn the global query into a query string, fetch, and hand the envelope over.
 * Nothing is computed in the browser.
 */
import { useCallback, useEffect, useState } from "react";
import { api, apiUrl, query as queryString } from "@/lib/api";
import { invalidate } from "@/lib/remote";
import { useApi } from "@/lib/remote";
import type { Envelope, GlobalQuery, MeResponse, ScreenKey } from "./types";

/** The filters the API accepts alongside the date range (spec 9.1). */
function params(q: GlobalQuery, extra: Record<string, string | number | undefined> = {}) {
  return queryString({
    from: q.from,
    to: q.to,
    compare: q.compare,
    interval: q.interval === "auto" ? undefined : q.interval,
    source: q.source,
    device: q.device,
    country: q.country,
    state: q.state,
    category: q.category,
    method: q.method,
    includeInternal: q.includeInternal === "1" ? 1 : undefined,
    ...extra,
  });
}

export interface ScreenState<T> {
  envelope: Envelope<T> | undefined;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** One screen's data, e.g. `useScreen<OverviewData>("overview", query)`. */
export function useScreen<T>(view: ScreenKey | string, q: GlobalQuery, extra?: Record<string, string | number | undefined>): ScreenState<T> {
  const { data, loading, error, refresh } = useApi<Envelope<T>>(`/analytics/${view}${params(q, extra)}`);
  return { envelope: data, loading, error, refresh };
}

/** A single funnel, which also takes the breakdown dimension. */
export function useFunnel<T>(id: string, q: GlobalQuery, by: string): ScreenState<T> {
  const { data, loading, error, refresh } = useApi<Envelope<T>>(`/analytics/funnels/${id}${params(q, { by })}`);
  return { envelope: data, loading, error, refresh };
}

export function useTrafficTimeseries<T>(q: GlobalQuery, metric: string): ScreenState<T> {
  const { data, loading, error, refresh } = useApi<Envelope<T>>(`/analytics/traffic/timeseries${params(q, { metric })}`);
  return { envelope: data, loading, error, refresh };
}

export function useTrafficBreakdown<T>(q: GlobalQuery, dimension: string, limit = 50): ScreenState<T> {
  const { data, loading, error, refresh } = useApi<Envelope<T>>(`/analytics/traffic/breakdown${params(q, { dimension, limit })}`);
  return { envelope: data, loading, error, refresh };
}

/** Who is signed in and which screens they may open. */
export function useAnalyticsMe() {
  const { data, loading, error, refresh } = useApi<MeResponse>("/analytics/me");
  return { session: data, loading, error, refresh };
}

/**
 * Realtime refreshes every 15 seconds while the tab is visible (spec 4.12).
 * It is deliberately not in the shared cache: it is never reused between screens.
 */
export function useRealtime<T>(intervalMs = 15000) {
  const [envelope, setEnvelope] = useState<Envelope<T> | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(true);

  const load = useCallback(async () => {
    try {
      setEnvelope(await api.get<Envelope<T>>("/analytics/realtime"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't load this just now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!visible) return;
    void load();
    const id = window.setInterval(() => void load(), intervalMs);
    return () => window.clearInterval(id);
  }, [visible, intervalMs, load]);

  return { envelope, loading, error, visible, refresh: load };
}

/** Download link for a table on a screen (CSV or Excel), with the same filters. */
export function exportUrl(view: string, table: string, q: GlobalQuery, format: "csv" | "xlsx") {
  return apiUrl(`/analytics/export${params(q, { view, table, format })}`);
}

/* ---------------- Saved views (spec 10.2) and scheduled reports (spec 10.3) ---------------- */

const VIEWS = "/analytics/views";
const SCHEDULES = "/analytics/schedules";

export interface SavedView {
  id: number;
  name: string;
  view: ScreenKey | null;
  query: Record<string, string>;
  url: string;
  shared: boolean;
  mine: boolean;
  owner: { id: number; name: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface ReportSchedule {
  id: number;
  name: string;
  view: ScreenKey;
  query: Record<string, string>;
  range: string;
  frequency: "daily" | "weekly" | "monthly";
  recipients: string[];
  format: "pdf" | "csv" | "xlsx";
  active: boolean;
  lastSentAt: string | null;
  nextRunAt: string | null;
  nextRange: { from: string; to: string };
  owner: { id: number; name: string | null };
  mine: boolean;
  url: string;
}

export function useSavedViews() {
  const { data, loading, error, refresh } = useApi<SavedView[]>(VIEWS);
  return { views: data, loading, error, refresh };
}

/** `query` is the current dashboard query string, e.g. "?view=traffic&from=…". */
export async function saveView(name: string, query: string, shared = false) {
  const view = await api.post<SavedView>(VIEWS, { name, query, shared });
  await invalidate(VIEWS);
  return view;
}

export async function deleteSavedView(id: number) {
  await api.del(`${VIEWS}/${id}`);
  await invalidate(VIEWS);
}

export function useSchedules() {
  const { data, loading, error, refresh } = useApi<ReportSchedule[]>(SCHEDULES);
  return { schedules: data, loading, error, refresh };
}

export async function createSchedule(input: {
  name: string;
  view: ScreenKey;
  frequency: ReportSchedule["frequency"];
  format: ReportSchedule["format"];
  recipients: string[];
  query?: string;
}) {
  const schedule = await api.post<ReportSchedule>(SCHEDULES, input);
  await invalidate(SCHEDULES);
  return schedule;
}

export async function updateSchedule(id: number, patch: Partial<{ name: string; frequency: string; format: string; recipients: string[]; active: boolean }>) {
  const schedule = await api.patch<ReportSchedule>(`${SCHEDULES}/${id}`, patch);
  await invalidate(SCHEDULES);
  return schedule;
}

export async function deleteSchedule(id: number) {
  await api.del(`${SCHEDULES}/${id}`);
  await invalidate(SCHEDULES);
}
