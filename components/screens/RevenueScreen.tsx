"use client";

import { useMemo } from "react";
import { revenueData } from "@/lib/mock/generators";
import { KpiGrid } from "@/components/KpiTile";
import { Card } from "@/components/Card";
import { ChartFrame } from "@/components/ChartFrame";
import { ColumnSeries } from "@/components/charts/ColumnSeries";
import { Share100Bar } from "@/components/charts/Share100Bar";
import { LineSeries } from "@/components/charts/LineSeries";
import { DataTable } from "@/components/DataTable";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { GlobalQuery } from "@/lib/types";

export function RevenueScreen({ query, isAdmin }: { query: GlobalQuery; isAdmin: boolean }) {
  const env = useMemo(() => revenueData(query, isAdmin), [query.from, query.to, query.compare, isAdmin]);
  const { data } = env;

  if (!isAdmin) {
    return (
      <Card>
        <div className="p-6 text-center">
          <p className="font-display text-base font-semibold text-navy">Revenue is admin-only</p>
          <p className="mt-1 text-sm text-muted">Ask an admin for access, or switch roles from the top bar to preview it.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Cash — collected through the platform</h3>
        <KpiGrid kpis={data.cash.kpis} />
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Booked — agreed but paid outside the platform</h3>
        <KpiGrid kpis={data.booked.kpis} />
      </div>

      <ChartFrame
        title="Net fee revenue over time"
        ariaLabel="Column chart of net fee revenue per day"
        chart={<ColumnSeries points={data.series.netFees.points} color="#0d7a68" valueFormatter={(v) => formatCurrency(v, true)} />}
        tableColumns={[
          { key: "t", label: "Date" },
          { key: "value", label: "Net fee revenue", align: "right", render: (r: any) => formatCurrency(r.value) },
        ]}
        tableRows={data.series.netFees.points}
        tableFilename="revenue-net-fees"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="By payment method">
          <Share100Bar rows={data.byMethod} />
        </Card>
        <Card title="Refunds">
          <dl className="grid grid-cols-3 gap-3 text-center">
            <div>
              <dt className="text-xs text-muted">Count</dt>
              <dd className="font-display text-xl font-semibold text-navy tabular-nums">{formatNumber(data.refunds.count)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Amount</dt>
              <dd className="font-display text-xl font-semibold text-navy tabular-nums">{formatCurrency(data.refunds.amount)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Median days</dt>
              <dd className="font-display text-xl font-semibold text-navy tabular-nums">{data.refunds.medianDaysToRefund}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card title="Quote value" subtitle={`Acceptance rate: ${formatPercent(data.quotes.acceptanceRate)}`}>
        <div className="h-56">
          <LineSeries points={data.quotes.series[0]?.points ?? []} color="#2a78d6" showPrevious={false} valueFormatter={(v) => formatCurrency(v, true)} />
        </div>
      </Card>

      <Card title="Ledger" subtitle="Every payment in range" padded={false}>
        <DataTable
          filename="revenue-ledger"
          rows={data.ledger}
          columns={[
            { key: "date", label: "Date" },
            { key: "reference", label: "Reference" },
            { key: "idea", label: "Idea" },
            { key: "method", label: "Method" },
            { key: "amount", label: "Amount", align: "right", render: (r: any) => formatCurrency(r.amount) },
            { key: "status", label: "Status" },
            { key: "refundStatus", label: "Refund" },
          ]}
        />
      </Card>
    </div>
  );
}
