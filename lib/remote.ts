"use client";

/**
 * Small query cache over lib/api.ts: shared state per key, one request in flight
 * per key, and invalidation after a change so every screen showing that data
 * refreshes itself.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api, errorMessage } from "./api";

export interface QueryState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
}

interface Entry {
  state: QueryState<unknown>;
  fetcher: () => Promise<unknown>;
  listeners: Set<() => void>;
  inflight?: Promise<void>;
  stale: boolean;
}

const entries = new Map<string, Entry>();
const EMPTY: QueryState<unknown> = { data: undefined, error: null, loading: true };

function entry(key: string, fetcher: () => Promise<unknown>): Entry {
  let found = entries.get(key);
  if (!found) {
    found = { state: EMPTY, fetcher, listeners: new Set(), stale: true };
    entries.set(key, found);
  } else {
    found.fetcher = fetcher;
  }
  return found;
}

function emit(e: Entry) {
  e.listeners.forEach((l) => l());
}

function load(key: string): Promise<void> {
  const e = entries.get(key);
  if (!e) return Promise.resolve();
  if (e.inflight) return e.inflight;
  e.stale = false;
  if (e.state.data === undefined) {
    e.state = { ...e.state, loading: true };
    emit(e);
  }
  e.inflight = e
    .fetcher()
    .then((data) => {
      e.state = { data, error: null, loading: false };
    })
    .catch((err) => {
      e.state = { data: e.state.data, error: errorMessage(err), loading: false };
    })
    .finally(() => {
      e.inflight = undefined;
      emit(e);
    });
  return e.inflight;
}

/**
 * Reads `key` from the cache, fetching when it's missing or stale.
 * A null key means "nothing to load yet" (e.g. signed out).
 */
export function useQuery<T>(key: string | null, fetcher: (signal?: AbortSignal) => Promise<T>): QueryState<T> & { refresh: () => Promise<void> } {
  const run = useCallback(() => fetcher(), [fetcher]);
  if (key) entry(key, run as () => Promise<unknown>);

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!key) return () => {};
      const e = entry(key, run as () => Promise<unknown>);
      e.listeners.add(listener);
      return () => {
        e.listeners.delete(listener);
      };
    },
    [key, run],
  );

  const snapshot = useCallback(() => (key ? (entries.get(key)?.state ?? EMPTY) : IDLE), [key]);
  const state = useSyncExternalStore(subscribe, snapshot, () => (key ? EMPTY : IDLE)) as QueryState<T>;

  useEffect(() => {
    if (!key) return;
    const e = entries.get(key);
    if (e && (e.state.data === undefined || e.stale) && !e.inflight) void load(key);
  }, [key, state.data]);

  const refresh = useCallback(async () => {
    if (key) {
      const e = entries.get(key);
      if (e) e.inflight = undefined;
      await load(key);
    }
  }, [key]);

  return { ...state, refresh };
}

const IDLE: QueryState<unknown> = { data: undefined, error: null, loading: false };

/** A GET query keyed by its path. */
export function useApi<T>(path: string | null) {
  const fetcher = useCallback(() => api.get<T>(path as string), [path]);
  return useQuery<T>(path, fetcher);
}

/**
 * Marks every key starting with one of these prefixes as stale: keys on screen
 * refetch now, the rest on their next use.
 */
export function invalidate(...prefixes: string[]) {
  const jobs: Promise<void>[] = [];
  for (const [key, e] of entries) {
    if (!prefixes.some((p) => key.startsWith(p))) continue;
    e.stale = true;
    e.inflight = undefined;
    if (e.listeners.size > 0) jobs.push(load(key));
    else entries.delete(key);
  }
  return Promise.all(jobs).then(() => undefined);
}

/**
 * Keeps screens current without anyone pressing reload: every `intervalMs` while the
 * tab is visible, and again the moment it regains focus, the matching keys are marked
 * stale so what is on screen refetches. A screen nobody is looking at costs nothing.
 */
export function useLiveRefresh(prefixes: string[], intervalMs = 30000) {
  const keys = prefixes.join("|");
  useEffect(() => {
    const list = keys.split("|").filter(Boolean);
    if (list.length === 0) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void invalidate(...list);
    };
    const id = window.setInterval(tick, intervalMs);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [keys, intervalMs]);
}

/** Drops everything, e.g. when a session ends. */
export function clearCache() {
  for (const [key, e] of entries) {
    if (e.listeners.size === 0) entries.delete(key);
    else {
      e.state = EMPTY;
      e.stale = true;
      e.inflight = undefined;
      emit(e);
    }
  }
}

/** Puts a value straight into the cache (e.g. a response we already have). */
export function primeQuery<T>(key: string, data: T) {
  const e = entries.get(key);
  if (!e) return;
  e.state = { data, error: null, loading: false };
  e.stale = false;
  emit(e);
}
