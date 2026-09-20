"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useFunnel } from "@/lib/analytics/api";
import { ScreenFallback } from "@/components/analytics/ScreenState";
import { Card } from "@/components/analytics/Card";
import { FunnelStrip } from "@/components/analytics/charts/FunnelStrip";
import { DataTable } from "@/components/analytics/DataTable";
import { formatNumber, formatPercent, formatDuration } from "@/lib/analytics/format";
import { buildQueryString } from "@/lib/analytics/urlState";
import type { FunnelData, GlobalQuery } from "@/lib/analytics/types";

const FUNNELS = [
  { key: "application", label: "Application" },
  { key: "sales", label: "Sales" },
  { key: "portal", label: "Portal" },
  { key: "courses", label: "Courses" },
];

const DIMENSIONS = [
  { key: "source", label: "Source" },
  { key: "device", label: "Device" },
  { key: "category", label: "Category" },
];

export function FunnelsScreen({ query }: { query: GlobalQuery }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [by, setBy] = useState("source");
  const funnelId = query.funnel ?? "application";

  const { envelope, loading, error, refresh } = useFunnel<FunnelData>(funnelId, query, by);
  if (!envelope) return <ScreenFallback loading={loading} error={error} onRetry={refresh} />;
  const { data } = envelope;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {FUNNELS.map((f) => (
          <button
            key={f.key}
            onClick={() => router.push(pathname + buildQueryString({ funnel: f.key as any }, searchParams))}
            className={`focus-ring rounded-full px-3.5 py-1.5 text-sm font-medium ${
              funnelId === f.key ? "bg-navy text-white" : "border border-line bg-white text-navy hover:border-navy-600"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card
        title={`${FUNNELS.find((f) => f.key === funnelId)?.label} funnel`}
        subtitle={`Overall conversion: ${formatPercent(data.overall)}`}
      >
        <FunnelStrip steps={data.steps} />
      </Card>

      <Card title="Breakdown" subtitle="Same funnel, split by">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {DIMENSIONS.map((d) => (
            <button
              key={d.key}
              onClick={() => setBy(d.key)}
              className={`focus-ring rounded-full px-3 py-1 text-xs font-medium ${
                by === d.key ? "bg-navy text-white" : "border border-line text-muted hover:text-navy"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        {data.notes.length > 0 && (
          <ul className="mb-3 space-y-1 rounded-xl bg-mist p-3 text-sm text-muted">
            {data.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
        {data.breakdown.length === 0 ? (
          <p className="text-sm text-muted">No breakdown for this range.</p>
        ) : (
          <DataTable
            filename={`funnel-${funnelId}-${by}`}
            rows={data.breakdown}
            columns={[
              { key: "label", label: DIMENSIONS.find((d) => d.key === by)?.label ?? "Segment" },
              ...data.steps.map((s, i) => ({
                key: `step${i}`,
                label: s.label,
                align: "right" as const,
                render: (r: any) => formatNumber(r.steps[i]?.count),
                sortValue: (r: any) => r.steps[i]?.count ?? 0,
              })),
            ]}
          />
        )}
      </Card>
    </div>
  );
}
