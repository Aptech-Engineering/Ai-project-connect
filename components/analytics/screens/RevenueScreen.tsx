"use client";

import { useScreen } from "@/lib/analytics/api";
import { ScreenFallback } from "@/components/analytics/ScreenState";
import { KpiGrid } from "@/components/analytics/KpiTile";
import { Card } from "@/components/analytics/Card";
import { ChartFrame } from "@/components/analytics/ChartFrame";
import { ColumnSeries } from "@/components/analytics/charts/ColumnSeries";
import { Share100Bar } from "@/components/analytics/charts/Share100Bar";
import { LineSeries } from "@/components/analytics/charts/LineSeries";
import { DataTable } from "@/components/analytics/DataTable";
import { formatCurrency, formatLabel, formatNumber, formatPercent } from "@/lib/analytics/format";
import type { GlobalQuery, RevenueData } from "@/lib/analytics/types";

export function RevenueScreen({ query, isAdmin }: { query: GlobalQuery; isAdmin: boolean }) {
  const { envelope, loading, error, refresh } = useScreen<RevenueData>("revenue", query);
  if (!envelope) return <ScreenFallback loading={loading} error={error} onRetry={refresh} />;
  const { data } = envelope;

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
              <dd className="font-display text-xl font-semibold text-navy tabular-nums">{formatNumber(data.refunds.medianDaysToRefund)}</dd>
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
            { key: "ideaRef", label: "Idea" },
            { key: "receiptNo", label: "Receipt" },
            { key: "method", label: "Method" },
            { key: "amount", label: "Amount", align: "right", render: (r: any) => formatCurrency(r.amount) },
            { key: "status", label: "Status", render: (r: any) => formatLabel(r.status) },
            { key: "refundStatus", label: "Refund", render: (r: any) => formatLabel(r.refundStatus) },
          ]}
        />
      </Card>
    </div>
  );
}
