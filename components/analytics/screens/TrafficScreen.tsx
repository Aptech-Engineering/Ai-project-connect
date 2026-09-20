"use client";

import { useState } from "react";
import { useScreen, useTrafficBreakdown, useTrafficTimeseries } from "@/lib/analytics/api";
import { BlockFallback, ScreenFallback } from "@/components/analytics/ScreenState";
import { KpiGrid } from "@/components/analytics/KpiTile";
import { ChartFrame } from "@/components/analytics/ChartFrame";
import { LineSeries } from "@/components/analytics/charts/LineSeries";
import { HorizontalBarList } from "@/components/analytics/charts/HorizontalBarList";
import { Heatmap } from "@/components/analytics/charts/Heatmap";
import { Card } from "@/components/analytics/Card";
import { formatNumber, formatPercent, formatDuration } from "@/lib/analytics/format";
import type { GlobalQuery, TrafficBreakdownData, TrafficData, TrafficTimeseriesData } from "@/lib/analytics/types";

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

  const { envelope, loading, error, refresh } = useScreen<TrafficData>("traffic", query);
  const ts = useTrafficTimeseries<TrafficTimeseriesData>(query, metric);
  const bd = useTrafficBreakdown<TrafficBreakdownData>(query, tab);

  if (!envelope) return <ScreenFallback loading={loading} error={error} onRetry={refresh} />;
  const { data } = envelope;

  const visitorSplit = data.newVsReturning.new + data.newVsReturning.returning;
  const newShare = visitorSplit > 0 ? data.newVsReturning.new / visitorSplit : 0;

  const fmt =
    metric === "bounce_rate" ? formatPercent : metric === "duration" ? (v: number) => formatDuration(v) : (v: number) => formatNumber(v, true);

  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.kpis} />

      <ChartFrame
        title="Traffic over time"
        subtitle="Comparison period shown as a dashed line"
        ariaLabel={`Line chart of ${metric} over time`}
        chart={
          ts.envelope ? (
            <LineSeries points={ts.envelope.data.series.points} valueFormatter={fmt as any} />
          ) : (
            <BlockFallback loading={ts.loading} error={ts.error} onRetry={ts.refresh} height="h-full" />
          )
        }
        tableColumns={[
          { key: "t", label: "Date" },
          { key: "value", label: "Value", align: "right" },
          { key: "previous", label: "Comparison", align: "right" },
        ]}
        tableRows={(ts.envelope?.data.series.points ?? [])}
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
        <HorizontalBarList rows={(bd.envelope?.data.rows ?? [])} format="number" />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="When people visit" subtitle="Day of week × hour, Africa/Lagos time">
          <Heatmap data={data.heatmap} />
        </Card>
        <Card title="New vs. returning" subtitle="Share of visitors seen before">
          <div className="flex h-4 w-full overflow-hidden rounded-full">
            <div style={{ width: `${newShare * 100}%`, backgroundColor: "#f26b22" }} />
            <div style={{ width: `${(1 - newShare) * 100}%`, backgroundColor: "#14a38b" }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-navy">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#f26b22" }} /> New {formatNumber(data.newVsReturning.new)} · {formatPercent(newShare)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#14a38b" }} /> Returning {formatNumber(data.newVsReturning.returning)} ·{" "}
              {formatPercent(1 - newShare)}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
