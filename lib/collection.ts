"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny persisted collection. Data lives in localStorage so the Client Portal
 * and Engineering Panel stay in sync across tabs of the same browser.
 * Swap this for API calls when the real back-end exists.
 */
export function createCollection<T>(key: string, seed: T[]) {
  const listeners = new Set<() => void>();
  let cache: T[] | null = null;

  const read = (): T[] => {
    if (cache) return cache;
    if (typeof window === "undefined") return seed;
    try {
      const raw = localStorage.getItem(key);
      cache = raw ? (JSON.parse(raw) as T[]) : seed;
    } catch {
      cache = seed;
    }
    return cache;
  };

  const emit = () => listeners.forEach((l) => l());

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key || e.key === null) {
        cache = null;
        listener();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };

  return {
    read,
    useItems: () => useSyncExternalStore(subscribe, read, () => seed),
    set(fn: (items: T[]) => T[]) {
      cache = fn(read());
      try {
        localStorage.setItem(key, JSON.stringify(cache));
      } catch {
        // storage full or blocked: keep in-memory changes for this tab
      }
      emit();
    },
    reset() {
      try {
        localStorage.removeItem(key);
      } catch {}
      cache = seed;
      emit();
    },
  };
}
