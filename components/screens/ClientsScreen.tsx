"use client";

import { useMemo } from "react";
import { clientsData } from "@/lib/mock/generators";
import { KpiGrid } from "@/components/KpiTile";
import { Card } from "@/components/Card";
import { ChartFrame } from "@/components/ChartFrame";
import { LineSeries } from "@/components/charts/LineSeries";
import { HorizontalBarList } from "@/components/charts/HorizontalBarList";
import { formatNumber, formatPercent } from "@/lib/format";
import type { GlobalQuery } from "@/lib/types";

export function ClientsScreen({ query }: { query: GlobalQuery }) {
  const env = useMemo(() => clientsData(query), [query.from, query.to, query.compare]);
  const { data } = env;

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
          <HorizontalBarList rows={data.engagement} />
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
