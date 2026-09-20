"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { DATE_PRESETS, presetToRange, buildQueryString } from "@/lib/analytics/urlState";
import type { GlobalQuery } from "@/lib/analytics/types";

const COMPARE_LABEL: Record<string, string> = {
  none: "None",
  previous: "Previous period",
  year: "Same period last year",
};

export function GlobalControls({ query }: { query: GlobalQuery }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dateOpen, setDateOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  function update(patch: Partial<GlobalQuery>) {
    router.push(pathname + buildQueryString(patch, searchParams));
  }

  function applyPreset(preset: string) {
    if (preset === "Custom") {
      setDateOpen(false);
      return;
    }
    const range = presetToRange(preset);
    update(range);
    setDateOpen(false);
  }

  const rangeLabel = `${query.from} → ${query.to}`;

  return (
    <div className="flex items-center gap-2 relative">
      <div className="relative">
        <button
          onClick={() => setDateOpen((v) => !v)}
          className="focus-ring flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-navy hover:border-navy-600 tabular-nums"
        >
          <span aria-hidden>📅</span>
          {rangeLabel}
        </button>
        {dateOpen && (
          <div className="absolute right-0 top-11 z-20 w-56 rounded-2xl border border-line bg-white p-2 shadow-soft">
            {DATE_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                className="focus-ring block w-full rounded-lg px-3 py-1.5 text-left text-sm text-navy hover:bg-mist"
              >
                {p}
              </button>
            ))}
            {DATE_PRESETS.includes("Custom" as any) && (
              <div className="mt-1 flex gap-1.5 border-t border-line px-1 pt-2">
                <input
                  type="date"
                  defaultValue={query.from}
                  onChange={(e) => update({ from: e.target.value })}
                  className="focus-ring w-1/2 rounded-lg border border-line px-2 py-1 text-xs"
                />
                <input
                  type="date"
                  defaultValue={query.to}
                  onChange={(e) => update({ to: e.target.value })}
                  className="focus-ring w-1/2 rounded-lg border border-line px-2 py-1 text-xs"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setCompareOpen((v) => !v)}
          className="focus-ring rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-navy hover:border-navy-600"
        >
          Compare: {COMPARE_LABEL[query.compare]}
        </button>
        {compareOpen && (
          <div className="absolute right-0 top-11 z-20 w-48 rounded-2xl border border-line bg-white p-2 shadow-soft">
            {Object.entries(COMPARE_LABEL).map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  update({ compare: key as GlobalQuery["compare"] });
                  setCompareOpen(false);
                }}
                className="focus-ring block w-full rounded-lg px-3 py-1.5 text-left text-sm text-navy hover:bg-mist"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setExportOpen((v) => !v)}
          aria-label="Export"
          className="focus-ring rounded-xl border border-line bg-white px-3 py-2 text-sm text-navy hover:border-navy-600"
        >
          ⤓
        </button>
        {exportOpen && (
          <div className="absolute right-0 top-11 z-20 w-56 rounded-2xl border border-line bg-white p-2 shadow-soft">
            <button
              onClick={() => {
                setExportOpen(false);
                window.print();
              }}
              className="focus-ring block w-full rounded-lg px-3 py-1.5 text-left text-sm text-navy hover:bg-mist"
            >
              Print / save screen as PDF
            </button>
            <p className="px-3 pt-1 text-[11px] leading-snug text-muted">
              Table-level CSV and Excel exports are on each table below.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
