"use client";

import { useScreen } from "@/lib/analytics/api";
import { ScreenFallback } from "@/components/analytics/ScreenState";
import { KpiGrid } from "@/components/analytics/KpiTile";
import { Card } from "@/components/analytics/Card";
import { HorizontalBarList } from "@/components/analytics/charts/HorizontalBarList";
import { DivergingBars } from "@/components/analytics/charts/DivergingBars";
import { DataTable } from "@/components/analytics/DataTable";
import { formatNumber, formatDateShort } from "@/lib/analytics/format";
import type { GlobalQuery, ProjectsData } from "@/lib/analytics/types";

export function ProjectsScreen({ query }: { query: GlobalQuery }) {
  const { envelope, loading, error, refresh } = useScreen<ProjectsData>("projects", query);
  if (!envelope) return <ScreenFallback loading={loading} error={error} onRetry={refresh} />;
  const { data } = envelope;

  // Stages with no completed transitions yet have a null median — leave them out rather than draw a zero.
  const timeInStageRows = data.timeInStage
    .filter((r) => r.medianDays !== null)
    .map((r) => ({ key: r.key, label: r.label, value: r.medianDays as number }));
  const updateFrequencyRows = data.updateFrequency.map((r) => ({
    key: r.code,
    label: r.stale ? `${r.title} · stale` : r.title,
    value: r.updates,
  }));

  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.kpis} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Projects by stage">
          <HorizontalBarList rows={data.byStage} />
        </Card>
        <Card title="Time in stage" subtitle="Median days, from stage history">
          {timeInStageRows.length ? <HorizontalBarList rows={timeInStageRows} /> : <p className="text-sm text-muted">No completed stage transitions in this range.</p>}
        </Card>
      </div>

      <Card title="Delivery vs. target" subtitle="Days early or late, for delivered projects">
        <DivergingBars rows={data.deliveryVsTarget} />
      </Card>

      <Card title="Update frequency" subtitle="Client-visible updates per active project, last 30 days">
        <HorizontalBarList rows={updateFrequencyRows} />
      </Card>

      <Card title="Projects" padded={false}>
        <DataTable
          filename="projects"
          rows={data.table}
          columns={[
            { key: "code", label: "Project", render: (r: any) => `${r.code} · ${r.title}` },
            { key: "lead", label: "Lead" },
            { key: "stage", label: "Stage", render: (r: any) => r.stageLabel ?? r.stage },
            { key: "progress", label: "Progress", align: "right", render: (r: any) => `${r.progress}%` },
            { key: "targetDate", label: "Target date", render: (r: any) => formatDateShort(r.targetDate) },
            { key: "daysOverdue", label: "Days overdue", align: "right" },
            { key: "lastClientUpdate", label: "Last client update", render: (r: any) => formatDateShort(r.lastClientUpdate) },
            { key: "rating", label: "Rating", align: "right" },
          ]}
        />
      </Card>
    </div>
  );
}
