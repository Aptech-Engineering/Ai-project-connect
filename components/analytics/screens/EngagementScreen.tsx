"use client";

import { useScreen } from "@/lib/analytics/api";
import { ScreenFallback } from "@/components/analytics/ScreenState";
import { KpiGrid } from "@/components/analytics/KpiTile";
import { Card } from "@/components/analytics/Card";
import { DataTable } from "@/components/analytics/DataTable";
import { HorizontalBarList } from "@/components/analytics/charts/HorizontalBarList";
import { formatNumber, formatPercent } from "@/lib/analytics/format";
import type { GlobalQuery, EngagementData } from "@/lib/analytics/types";

const SEARCH_RESULT_LABELS: Record<string, string> = {
  found: "Found",
  not_found: "Not found",
  rate_limited: "Rate limited",
  error: "Error",
};

export function EngagementScreen({ query }: { query: GlobalQuery }) {
  const { envelope, loading, error, refresh } = useScreen<EngagementData>("engagement", query);
  if (!envelope) return <ScreenFallback loading={loading} error={error} onRetry={refresh} />;
  const { data } = envelope;

  const searchRows = Object.entries(data.trackerSearches.byResult).map(([key, value]) => ({
    key,
    label: SEARCH_RESULT_LABELS[key] ?? key,
    value,
  }));
  const downloadRows = data.downloads.map((d) => ({ key: d.kind, label: d.kind.replace(/^./, (c) => c.toUpperCase()), value: d.count }));
  const scrollSteps: Array<[string, number]> = [
    ["25%", data.scrollDepth[25]],
    ["50%", data.scrollDepth[50]],
    ["75%", data.scrollDepth[75]],
    ["100%", data.scrollDepth[100]],
  ];

  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.kpis} />

      <Card title="Top interactions" subtitle="Event × target, with click-through rate relative to the page it sits on" padded={false}>
        <DataTable
          filename="engagement-interactions"
          rows={data.interactions}
          columns={[
            { key: "target", label: "Target", render: (r) => `${r.target} · ${r.path}` },
            { key: "event", label: "Event" },
            { key: "count", label: "Clicks", align: "right", render: (r) => formatNumber(r.count) },
            { key: "visitors", label: "Unique visitors", align: "right", render: (r) => formatNumber(r.visitors) },
            { key: "ctr", label: "CTR", align: "right", render: (r) => formatPercent(r.ctr) },
          ]}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Tracker searches"
          subtitle={`By result · ${formatPercent(data.trackerSearches.notFoundRate)} not found · ${formatNumber(data.trackerSearches.byKind.project)} project, ${formatNumber(
            data.trackerSearches.byKind.idea,
          )} idea`}
        >
          <HorizontalBarList rows={searchRows} />
        </Card>
        <Card title="Downloads" subtitle="Report PDFs, proposals and shared files (counts only)">
          <HorizontalBarList rows={downloadRows} />
        </Card>
      </div>

      <Card title="Scroll depth" subtitle="Share of home-page views reaching each threshold">
        <div className="grid grid-cols-4 gap-3">
          {scrollSteps.map(([label, v]) => (
            <div key={label} className="rounded-xl bg-mist p-3 text-center">
              <div className="font-display text-lg font-semibold text-navy tabular-nums">{formatPercent(v)}</div>
              <div className="text-xs text-muted">reach {label}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
