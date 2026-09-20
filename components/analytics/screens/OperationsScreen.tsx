"use client";

import { useScreen } from "@/lib/analytics/api";
import { ScreenFallback } from "@/components/analytics/ScreenState";
import { Card } from "@/components/analytics/Card";
import { ChartFrame } from "@/components/analytics/ChartFrame";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { HorizontalBarList } from "@/components/analytics/charts/HorizontalBarList";
import { LineSeries } from "@/components/analytics/charts/LineSeries";
import { DataTable } from "@/components/analytics/DataTable";
import { formatDateShort, formatNumber, formatPercent } from "@/lib/analytics/format";
import type { GlobalQuery, OperationsData } from "@/lib/analytics/types";

// The API sends one series per notification status; the chart wants one row per day.
const MESSAGE_STATUSES = [
  { key: "sent", label: "Sent", color: "#f26b22" },
  { key: "logged", label: "Logged (not sent)", color: "#2a78d6" },
  { key: "failed", label: "Failed", color: "#e34948" },
  { key: "queued", label: "Queued", color: "#eda100" },
];

export function OperationsScreen({ query }: { query: GlobalQuery }) {
  const { envelope, loading, error, refresh } = useScreen<OperationsData>("operations", query);
  if (!envelope) return <ScreenFallback loading={loading} error={error} onRetry={refresh} />;
  const { data } = envelope;

  const byStatus = new Map(data.messaging.series.map((s) => [s.key, s.points]));
  const days = data.messaging.series[0]?.points ?? [];
  const messagingMerged = days.map((p, i) => {
    const row: Record<string, string | number> = { t: p.t };
    for (const s of MESSAGE_STATUSES) row[s.key] = byStatus.get(s.key)?.[i]?.value ?? 0;
    return row;
  });

  const errorPoints = data.api.errors.map((e) => ({ t: e.t, value: e.serverErrors + e.clientErrors }));
  const failureRows = data.messaging.topErrors.map((e, i) => ({ key: `${i}-${e.error}`, label: e.error, value: e.count }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Message failure rate" value={formatPercent(data.messaging.failureRate)} />
        <MiniStat label="Payment success rate" value={formatPercent(data.payments.successRate)} />
        <MiniStat label="Abandoned checkouts" value={formatNumber(data.payments.abandoned)} />
        <MiniStat
          label="Median confirm time"
          value={data.payments.medianConfirmHours === null || data.payments.medianConfirmHours === undefined ? "—" : `${data.payments.medianConfirmHours}h`}
        />
      </div>

      <Card
        title="Messaging"
        subtitle={`Emails and SMS by status, per day · email ${formatNumber(data.messaging.byChannel.email.sent + data.messaging.byChannel.email.logged)}, SMS ${formatNumber(
          data.messaging.byChannel.sms.sent + data.messaging.byChannel.sms.logged,
        )}`}
      >
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={messagingMerged} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#e3e8f0" vertical={false} />
              <XAxis dataKey="t" tickFormatter={formatDateShort} tick={{ fill: "#5b6b82", fontSize: 11 }} axisLine={{ stroke: "#e3e8f0" }} tickLine={false} minTickGap={40} />
              <YAxis tick={{ fill: "#5b6b82", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
              <Tooltip labelFormatter={(l) => formatDateShort(String(l))} contentStyle={{ borderRadius: 12, border: "1px solid #e3e8f0", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {MESSAGE_STATUSES.map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top failure reasons" subtitle="Why messages did not go out">
          {failureRows.length ? <HorizontalBarList rows={failureRows} /> : <p className="text-sm text-muted">No failed messages in this range.</p>}
        </Card>
        <Card title="Security">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["Staff sign-ins", data.security.staffSignIns],
              ["Failed sign-ins", data.security.failedSignIns],
              ["Password resets", data.security.passwordResets],
              ["Codes requested", data.security.codesRequested],
              ["Codes verified", data.security.codesVerified],
              ["Rate-limit hits", data.security.rateLimited],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-center justify-between rounded-lg bg-mist px-3 py-2">
                <dt className="text-muted">{label}</dt>
                <dd className="font-medium tabular-nums text-navy">{formatNumber(value as number)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card title="API health" subtitle="Errors per day, and the slowest endpoints (p95 ms)">
        <div className="space-y-4">
          <ChartFrame
            title="Errors (4xx/5xx) per day"
            ariaLabel="Line chart of API errors per day"
            chart={<LineSeries points={errorPoints} color="#e34948" showPrevious={false} />}
            tableColumns={[
              { key: "t", label: "Date" },
              { key: "serverErrors", label: "5xx", align: "right" },
              { key: "clientErrors", label: "4xx", align: "right" },
            ]}
            tableRows={data.api.errors}
            tableFilename="operations-api-errors"
            height="h-48"
          />
          <DataTable
            filename="operations-slowest-endpoints"
            rows={data.api.slowest}
            columns={[
              { key: "route", label: "Endpoint", render: (r) => `${r.method} ${r.route.replace(/^\/api/, "")}` },
              { key: "requests", label: "Requests", align: "right", render: (r) => formatNumber(r.requests) },
              { key: "medianMs", label: "Median (ms)", align: "right", render: (r) => formatNumber(r.medianMs) },
              { key: "p95Ms", label: "p95 (ms)", align: "right", render: (r) => formatNumber(r.p95Ms) },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-soft">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold tabular-nums text-navy">{value}</div>
    </div>
  );
}
