"use client";

import { useMemo, useState } from "react";
import { trafficData, trafficTimeseries, trafficBreakdown } from "@/lib/mock/generators";
import { KpiGrid } from "@/components/KpiTile";
import { ChartFrame } from "@/components/ChartFrame";
import { LineSeries } from "@/components/charts/LineSeries";
import { HorizontalBarList } from "@/components/charts/HorizontalBarList";
import { Heatmap } from "@/components/charts/Heatmap";
import { Card } from "@/components/Card";
import { formatNumber, formatPercent, formatDuration } from "@/lib/format";
import type { GlobalQuery } from "@/lib/types";

const METRICS = [
  { key: "visitors", label: "Visitors" },
  { key: "sessions", label: "Sessions" },
  { key: "pageviews", label: "Page views" },
  { key: "bounce_rate", label: "Bounce rate" },
  { key: "duration", label: "Avg. duration" },
];

const TABS = [
  { key: "source", label: "Source" },
  { key: "medium", label: "Medium" },
  { key: "campaign", label: "Campaign" },
  { key: "referrer", label: "Referrer" },
  { key: "landing_page", label: "Landing page" },
  { key: "page", label: "Page" },
  { key: "device", label: "Device" },
  { key: "browser", label: "Browser" },
  { key: "os", label: "OS" },
  { key: "country", label: "Country" },
  { key: "state", label: "State" },
];

export function TrafficScreen({ query }: { query: GlobalQuery }) {
  const [metric, setMetric] = useState("visitors");
  const [tab, setTab] = useState("source");

  const env = useMemo(() => trafficData(query), [query.from, query.to, query.compare]);
  const ts = useMemo(() => trafficTimeseries(query, metric), [query.from, query.to, metric]);
  const bd = useMemo(() => trafficBreakdown(query, tab), [query.from, query.to, tab]);
  const { data } = env;

  const fmt =
    metric === "bounce_rate" ? formatPercent : metric === "duration" ? (v: number) => formatDuration(v) : (v: number) => formatNumber(v, true);

  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.kpis} />

      <ChartFrame
        title="Traffic over time"
        subtitle="Comparison period shown as a dashed line"
        ariaLabel={`Line chart of ${metric} over time`}
        chart={<LineSeries points={ts.data.series.points} valueFormatter={fmt as any} />}
        tableColumns={[
          { key: "t", label: "Date" },
          { key: "value", label: "Value", align: "right" },
          { key: "previous", label: "Comparison", align: "right" },
        ]}
        tableRows={ts.data.series.points}
        tableFilename={`traffic-${metric}`}
        height="h-72"
      />
      <div className="-mt-3 flex flex-wrap gap-1.5">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`focus-ring rounded-full px-3 py-1 text-xs font-medium ${
              metric === m.key ? "bg-navy text-white" : "border border-line text-muted hover:text-navy"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <Card title="Breakdown" subtitle="Where visits come from and how they arrive">
        <div className="mb-3 flex flex-wrap gap-1.5 border-b border-line pb-3">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`focus-ring rounded-full px-3 py-1 text-xs font-medium ${
                tab === t.key ? "bg-navy text-white" : "border border-line text-muted hover:text-navy"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <HorizontalBarList rows={bd.data.rows} format="number" />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="When people visit" subtitle="Day of week × hour, Africa/Lagos time">
          <Heatmap data={data.heatmap} />
        </Card>
        <Card title="New vs. returning" subtitle="Share of visitors seen before">
          <div className="flex h-4 w-full overflow-hidden rounded-full">
            <div style={{ width: `${data.newVsReturning.new}%`, backgroundColor: "#f26b22" }} />
            <div style={{ width: `${data.newVsReturning.returning}%`, backgroundColor: "#14a38b" }} />
          </div>
          <div className="mt-2 flex gap-4 text-xs text-navy">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#f26b22" }} /> New {data.newVsReturning.new}%
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#14a38b" }} /> Returning {data.newVsReturning.returning}%
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
