"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny persisted collection. Data lives in localStorage so the Client Portal
 * and Engineering Panel stay in sync across tabs of the same browser.
 * Swap this for API calls when the real back-end exists.
 */
/** A single persisted object (e.g. site content). New default fields are merged into saved data. */
export function createDocument<T extends Record<string, unknown>>(key: string, defaults: T) {
  const listeners = new Set<() => void>();
  let cache: T | null = null;

  const read = (): T => {
    if (cache) return cache;
    if (typeof window === "undefined") return defaults;
    try {
      const raw = localStorage.getItem(key);
      const saved = raw ? (JSON.parse(raw) as Partial<T>) : {};
      const merged = { ...defaults } as Record<string, unknown>;
      for (const k of Object.keys(saved)) {
        const d = (defaults as Record<string, unknown>)[k];
        const v = (saved as Record<string, unknown>)[k];
        merged[k] = d && v && typeof d === "object" && !Array.isArray(d) ? { ...(d as object), ...(v as object) } : v;
      }
      cache = merged as T;
    } catch {
      cache = defaults;
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
    useDoc: () => useSyncExternalStore(subscribe, read, () => defaults),
    set(next: T) {
      cache = next;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      emit();
    },
    reset() {
      try {
        localStorage.removeItem(key);
      } catch {}
      cache = defaults;
      emit();
    },
  };
}

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
