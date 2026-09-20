"use client";

import { Card } from "@/components/analytics/Card";

/**
 * What a screen shows before its data arrives, or when the request fails.
 * Spec 13.1: never a bare spinner, never a misleading zero.
 */
export function ScreenFallback({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (error && !loading) {
    return (
      <Card>
        <p className="font-display text-sm font-semibold text-navy">We couldn&rsquo;t load this screen</p>
        <p className="mt-1 text-sm text-muted">{error}</p>
        <button onClick={() => void onRetry()} className="focus-ring mt-3 rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800">
          Try again
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-line bg-white shadow-soft" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-72 animate-pulse rounded-2xl border border-line bg-white shadow-soft" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-line bg-white shadow-soft" />
    </div>
  );
}

/** A smaller version for one card inside a screen that loads on its own. */
export function BlockFallback({ loading, error, onRetry, height = "h-64" }: { loading: boolean; error: string | null; onRetry: () => void; height?: string }) {
  if (error && !loading) {
    return (
      <div className={`flex ${height} flex-col items-center justify-center gap-2 rounded-xl border border-line bg-mist/60 p-4 text-center`}>
        <p className="text-sm text-muted">{error}</p>
        <button onClick={() => void onRetry()} className="focus-ring rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-navy">
          Try again
        </button>
      </div>
    );
  }
  return <div className={`${height} animate-pulse rounded-xl bg-mist`} aria-busy="true" />;
}
