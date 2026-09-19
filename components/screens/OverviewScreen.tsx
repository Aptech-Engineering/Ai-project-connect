"use client";

import { useMemo } from "react";
import Link from "next/link";
import { overviewData } from "@/lib/mock/generators";
import { KpiGrid } from "@/components/KpiTile";
import { ChartFrame } from "@/components/ChartFrame";
import { LineSeries } from "@/components/charts/LineSeries";
import { FunnelStrip } from "@/components/charts/FunnelStrip";
import { HorizontalBarList } from "@/components/charts/HorizontalBarList";
import { StatusPill } from "@/components/StatusPill";
import { Card } from "@/components/Card";
import { formatNumber, formatPercent } from "@/lib/format";
import type { GlobalQuery } from "@/lib/types";

export function OverviewScreen({ query }: { query: GlobalQuery }) {
  const env = useMemo(() => overviewData(query), [query.from, query.to, query.compare]);
  const { data } = env;

  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.kpis} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Visitors per day"
          ariaLabel="Line chart of visitors per day for the selected range"
          chart={<LineSeries points={data.trend.visitors.points} color="#f26b22" valueFormatter={(v) => formatNumber(v, true)} />}
          tableColumns={[
            { key: "t", label: "Date" },
            { key: "value", label: "Visitors", align: "right" },
            { key: "previous", label: "Comparison", align: "right" },
          ]}
          tableRows={data.trend.visitors.points}
          tableFilename="overview-visitors"
        />
        <ChartFrame
          title="Ideas submitted per day"
          ariaLabel="Line chart of ideas submitted per day for the selected range"
          chart={<LineSeries points={data.trend.ideas.points} color="#14a38b" valueFormatter={(v) => formatNumber(v, true)} />}
          tableColumns={[
            { key: "t", label: "Date" },
            { key: "value", label: "Ideas submitted", align: "right" },
            { key: "previous", label: "Comparison", align: "right" },
          ]}
          tableRows={data.trend.ideas.points}
          tableFilename="overview-ideas"
        />
      </div>

      <Card title="Application funnel" subtitle="Visitors → idea form opened → fee paid → submitted → quoted → accepted">
        <FunnelStrip steps={data.funnel} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Needs attention" subtitle="Overdue projects, transfers, refunds and stale projects">
          <div className="space-y-4">
            <AttentionGroup label="Overdue projects" status="critical">
              {data.attention.overdue.map((r) => (
                <AttentionRow key={r.id} link={r.link} primary={r.title} secondary={`${r.daysOverdue} day${r.daysOverdue === 1 ? "" : "s"} overdue`} />
              ))}
            </AttentionGroup>
            <AttentionGroup label="Transfers waiting" status="warning">
              {data.attention.transfers.map((r) => (
                <AttentionRow key={r.id} link={r.link} primary={r.reference} secondary={`₦${r.amount.toLocaleString()} · waiting ${r.hoursWaiting}h`} />
              ))}
            </AttentionGroup>
            <AttentionGroup label="Refunds due" status="serious">
              {data.attention.refunds.map((r) => (
                <AttentionRow key={r.id} link={r.link} primary={r.reference} secondary={`₦${r.amount.toLocaleString()} · ${r.daysWaiting}d waiting`} />
              ))}
            </AttentionGroup>
            <AttentionGroup label="Stale projects" status="serious">
              {data.attention.stale.map((r) => (
                <AttentionRow key={r.id} link={r.link} primary={r.title} secondary={`No update in ${r.daysSinceUpdate} days`} />
              ))}
            </AttentionGroup>
          </div>
        </Card>

        <Card title="Top sources" subtitle="Top 5 traffic sources with application conversion">
          <HorizontalBarList rows={data.topSources} format="number" topN={5} />
        </Card>
      </div>
    </div>
  );
}

function AttentionGroup({ label, status, children }: { label: string; status: "good" | "warning" | "serious" | "critical"; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <StatusPill status={status} label={label} />
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function AttentionRow({ link, primary, secondary }: { link: string; primary: string; secondary: string }) {
  return (
    <Link href={link} className="focus-ring flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs hover:bg-mist">
      <span className="truncate text-navy">{primary}</span>
      <span className="shrink-0 tabular-nums text-muted">{secondary}</span>
    </Link>
  );
}
