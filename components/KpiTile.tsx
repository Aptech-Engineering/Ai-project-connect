"use client";

import { formatByKind } from "@/lib/format";
import type { Kpi } from "@/lib/types";
import clsx from "clsx";

const KIND_LABEL: Record<string, string> = {
  cash: "Cash",
  booked: "Booked",
  estimate: "Estimate",
  liability: "Liability",
  pending: "Pending",
};

export function KpiTile({ kpi }: { kpi: Kpi }) {
  if (kpi.restricted) {
    return (
      <div className="rounded-2xl border border-line bg-white p-4 shadow-soft">
        <div className="text-xs font-medium text-muted">{kpi.label}</div>
        <div className="mt-2 font-display text-xl font-semibold text-muted">Admin only</div>
      </div>
    );
  }

  const isGood =
    kpi.goodDirection === "none" || kpi.change === null || kpi.change === undefined
      ? null
      : kpi.goodDirection === "up"
      ? kpi.change >= 0
      : kpi.change <= 0;

  const deltaClass =
    isGood === null ? "text-muted" : isGood ? "bg-teal-soft text-teal-700" : "bg-danger-soft text-danger";

  const arrow = kpi.change === null || kpi.change === undefined ? "" : kpi.change >= 0 ? "▲" : "▼";

  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted">{kpi.label}</div>
        {kpi.kind && (
          <span className="rounded-full bg-blue-soft px-2 py-0.5 text-[10px] font-medium text-navy-600">
            {KIND_LABEL[kpi.kind]}
          </span>
        )}
      </div>
      <div className="mt-1.5 font-display text-2xl font-semibold tabular-nums text-navy">
        {formatByKind(kpi.value, kpi.format, true)}
      </div>
      {kpi.change !== null && kpi.change !== undefined && (
        <div className={clsx("mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", deltaClass)}>
          {arrow} {Math.abs(kpi.change * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {kpis.map((k) => (
        <KpiTile key={k.key} kpi={k} />
      ))}
    </div>
  );
}
