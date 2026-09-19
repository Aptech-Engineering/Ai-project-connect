"use client";

import { useMemo } from "react";
import { projectsData } from "@/lib/mock/generators";
import { KpiGrid } from "@/components/KpiTile";
import { Card } from "@/components/Card";
import { HorizontalBarList } from "@/components/charts/HorizontalBarList";
import { DivergingBars } from "@/components/charts/DivergingBars";
import { DataTable } from "@/components/DataTable";
import { formatNumber, formatDateShort } from "@/lib/format";
import type { GlobalQuery } from "@/lib/types";

export function ProjectsScreen({ query }: { query: GlobalQuery }) {
  const env = useMemo(() => projectsData(query), [query.from, query.to, query.compare]);
  const { data } = env;

  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.kpis} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Projects by stage">
          <HorizontalBarList rows={data.byStage} />
        </Card>
        <Card title="Time in stage" subtitle="Median days, from stage history">
          <HorizontalBarList rows={data.timeInStage} />
        </Card>
      </div>

      <Card title="Delivery vs. target" subtitle="Days early or late, for delivered projects">
        <DivergingBars rows={data.deliveryVsTarget} />
      </Card>

      <Card title="Update frequency" subtitle="Client-visible updates per active project, last 30 days">
        <HorizontalBarList rows={data.updateFrequency} />
      </Card>

      <Card title="Projects" padded={false}>
        <DataTable
          filename="projects"
          rows={data.table}
          columns={[
            { key: "project", label: "Project" },
            { key: "lead", label: "Lead" },
            { key: "stage", label: "Stage" },
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
