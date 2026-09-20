"use client";

import { useScreen } from "@/lib/analytics/api";
import { ScreenFallback } from "@/components/analytics/ScreenState";
import { KpiGrid } from "@/components/analytics/KpiTile";
import { Card } from "@/components/analytics/Card";
import { ChartFrame } from "@/components/analytics/ChartFrame";
import { HorizontalBarList } from "@/components/analytics/charts/HorizontalBarList";
import { DataTable } from "@/components/analytics/DataTable";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatDateShort, formatLabel, formatNumber } from "@/lib/analytics/format";
import type { GlobalQuery, PipelineData } from "@/lib/analytics/types";

export function PipelineScreen({ query }: { query: GlobalQuery }) {
  const { envelope, loading, error, refresh } = useScreen<PipelineData>("pipeline", query);
  if (!envelope) return <ScreenFallback loading={loading} error={error} onRetry={refresh} />;
  const { data } = envelope;

  const merged = data.series.submitted.online.points.map((p, i) => ({
    t: p.t,
    online: p.value,
    walkIn: data.series.submitted.walkIn.points[i]?.value ?? 0,
  }));

  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.kpis} />

      <Card title="Ideas submitted over time" subtitle="Split online vs. walk-in">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={merged} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#e3e8f0" vertical={false} />
              <XAxis dataKey="t" tickFormatter={formatDateShort} tick={{ fill: "#5b6b82", fontSize: 11 }} axisLine={{ stroke: "#e3e8f0" }} tickLine={false} minTickGap={40} />
              <YAxis tick={{ fill: "#5b6b82", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
              <Tooltip labelFormatter={(l) => formatDateShort(String(l))} contentStyle={{ borderRadius: 12, border: "1px solid #e3e8f0", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="online" name="Online" stroke="#f26b22" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="walkIn" name="Walk-in" stroke="#2a78d6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="By category">
          <HorizontalBarList rows={data.by.category} />
        </Card>
        <Card title="Ageing" subtitle="Submitted ideas not yet quoted">
          <HorizontalBarList rows={data.ageing} />
        </Card>
      </div>

      <Card title="Ideas" padded={false}>
        <DataTable
          filename="pipeline-ideas"
          rows={data.table}
          columns={[
            { key: "ref", label: "Ref" },
            { key: "title", label: "Title" },
            { key: "category", label: "Category" },
            { key: "source", label: "Source", render: (r: any) => formatLabel(r.source) },
            { key: "submittedAt", label: "Submitted", render: (r: any) => formatDateShort(r.submittedAt) },
            { key: "feeStatus", label: "Fee status", render: (r: any) => formatLabel(r.feeStatus) },
            { key: "stage", label: "Stage", render: (r: any) => formatLabel(r.stage) },
            { key: "daysWaiting", label: "Days waiting", align: "right" },
          ]}
        />
      </Card>
    </div>
  );
}
