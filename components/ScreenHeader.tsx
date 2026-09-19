"use client";

import { useState } from "react";
import type { ScreenKey } from "@/lib/types";

export function ScreenHeader({
  title,
  tagline,
  filters,
  onSave,
}: {
  title: string;
  tagline: string;
  filters?: { label: string; value: string; onClear: () => void }[];
  onSave?: () => void;
}) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-semibold text-navy">{title}</h1>
          <p className="text-sm text-muted">{tagline}</p>
        </div>
        <button
          onClick={() => {
            setSaved(true);
            onSave?.();
            setTimeout(() => setSaved(false), 1600);
          }}
          className="focus-ring rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-medium text-navy hover:border-navy-600"
        >
          {saved ? "Saved" : "Save view"}
        </button>
      </div>
      {filters && filters.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.label}
              onClick={f.onClear}
              className="focus-ring inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-700"
            >
              {f.label}: {f.value} <span aria-hidden>✕</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Footer({ definitionsHref }: { definitionsHref: () => void }) {
  const [now] = useState(() => new Date());
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
      <span>
        Data as of {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · Africa/Lagos
      </span>
      <button onClick={definitionsHref} className="focus-ring underline decoration-dotted underline-offset-2 hover:text-navy">
        Definitions ⓘ
      </button>
    </div>
  );
}
