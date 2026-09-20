"use client";

import { useScreen } from "@/lib/analytics/api";
import { ScreenFallback } from "@/components/analytics/ScreenState";
import { KpiGrid } from "@/components/analytics/KpiTile";
import { Card } from "@/components/analytics/Card";
import { ChartFrame } from "@/components/analytics/ChartFrame";
import { LineSeries } from "@/components/analytics/charts/LineSeries";
import { HorizontalBarList } from "@/components/analytics/charts/HorizontalBarList";
import { formatNumber, formatPercent } from "@/lib/analytics/format";
import type { GlobalQuery, ClientsData } from "@/lib/analytics/types";

export function ClientsScreen({ query }: { query: GlobalQuery }) {
  const { envelope, loading, error, refresh } = useScreen<ClientsData>("clients", query);
  if (!envelope) return <ScreenFallback loading={loading} error={error} onRetry={refresh} />;
  const { data } = envelope;

  const engagementRows = [
    { key: "approvals", label: "Milestone approvals", value: data.engagement.approvals },
    { key: "changeRequests", label: "Change requests", value: data.engagement.changeRequests },
    { key: "uploads", label: "Uploads", value: data.engagement.uploads },
    { key: "courseRequests", label: "Course requests", value: data.engagement.courseRequests },
    { key: "ratings", label: "Ratings left", value: data.engagement.ratings },
  ];

  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.kpis} />

      <ChartFrame
        title="Sign-ins over time"
        ariaLabel="Line chart of portal sign-ins per day"
        chart={<LineSeries points={data.series.signIns.points} color="#2a78d6" valueFormatter={(v) => formatNumber(v)} />}
        tableColumns={[
          { key: "t", label: "Date" },
          { key: "value", label: "Sign-ins", align: "right" },
        ]}
        tableRows={data.series.signIns.points}
        tableFilename="clients-signins"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Engagement" subtitle="Milestone approvals, change requests, uploads, course requests, ratings">
          <HorizontalBarList rows={engagementRows} />
        </Card>
        <Card title="By location">
          <HorizontalBarList rows={data.byLocation} />
        </Card>
      </div>

      <Card title="Opt-outs">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-mist p-4 text-center">
            <div className="font-display text-xl font-semibold text-navy tabular-nums">{formatPercent(data.optOuts.digest)}</div>
            <div className="text-xs text-muted">Opted out of weekly emails</div>
          </div>
          <div className="rounded-xl bg-mist p-4 text-center">
            <div className="font-display text-xl font-semibold text-navy tabular-nums">{formatPercent(data.optOuts.promos)}</div>
            <div className="text-xs text-muted">Opted out of course suggestions</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
