"use client";

import { useMemo } from "react";
import { engagementData } from "@/lib/mock/generators";
import { KpiGrid } from "@/components/KpiTile";
import { Card } from "@/components/Card";
import { DataTable } from "@/components/DataTable";
import { HorizontalBarList } from "@/components/charts/HorizontalBarList";
import { formatNumber, formatPercent } from "@/lib/format";
import type { GlobalQuery } from "@/lib/types";

export function EngagementScreen({ query }: { query: GlobalQuery }) {
  const env = useMemo(() => engagementData(query), [query.from, query.to, query.compare]);
  const { data } = env;

  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.kpis} />

      <Card title="Top interactions" subtitle="Event × target, with click-through rate relative to the page it sits on" padded={false}>
        <DataTable
          filename="engagement-interactions"
          rows={data.interactions}
          columns={[
            { key: "label", label: "Target" },
            { key: "value", label: "Clicks", align: "right", sortValue: (r) => r.value },
            { key: "extra", label: "Unique visitors", align: "right", render: (r) => formatNumber((r as any).extra?.visitors) },
            { key: "ctr", label: "CTR", align: "right", render: (r) => formatPercent((r as any).extra?.ctr) },
          ]}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Tracker searches" subtitle="By result">
          <HorizontalBarList rows={data.trackerSearches} />
        </Card>
        <Card title="Downloads" subtitle="Report PDFs, proposals and shared files (counts only)">
          <HorizontalBarList rows={data.downloads} />
        </Card>
      </div>

      <Card title="Scroll depth" subtitle="Share of home-page views reaching each threshold">
        <div className="grid grid-cols-4 gap-3">
          {[
            ["25%", data.scrollDepth.d25],
            ["50%", data.scrollDepth.d50],
            ["75%", data.scrollDepth.d75],
            ["100%", data.scrollDepth.d100],
          ].map(([label, v]) => (
            <div key={label as string} className="rounded-xl bg-mist p-3 text-center">
              <div className="font-display text-lg font-semibold text-navy tabular-nums">{formatPercent(v as number)}</div>
              <div className="text-xs text-muted">reach {label}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
