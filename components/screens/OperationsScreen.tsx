"use client";

import { useMemo } from "react";
import { operationsData } from "@/lib/mock/generators";
import { Card } from "@/components/Card";
import { ChartFrame } from "@/components/ChartFrame";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { HorizontalBarList } from "@/components/charts/HorizontalBarList";
import { LineSeries } from "@/components/charts/LineSeries";
import { DataTable } from "@/components/DataTable";
import { formatDateShort, formatNumber, formatPercent, formatDuration } from "@/lib/format";
import type { GlobalQuery } from "@/lib/types";

export function OperationsScreen({ query }: { query: GlobalQuery }) {
  const env = useMemo(() => operationsData(query), [query.from, query.to, query.compare]);
  const { data } = env;

  const messagingMerged = data.messaging.series.emailSent.points.map((p, i) => ({
    t: p.t,
    emailSent: p.value,
    emailFailed: data.messaging.series.emailFailed.points[i]?.value ?? 0,
    smsSent: data.messaging.series.smsSent.points[i]?.value ?? 0,
    smsFailed: data.messaging.series.smsFailed.points[i]?.value ?? 0,
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Message failure rate" value={formatPercent(data.messaging.failureRate)} />
        <MiniStat label="Payment success rate" value={formatPercent(data.payments.successRate)} />
        <MiniStat label="Abandoned checkouts" value={formatNumber(data.payments.abandoned)} />
        <MiniStat label="Median confirm time" value={`${data.payments.medianConfirmHours}h`} />
      </div>

      <Card title="Messaging" subtitle="Emails and SMS by status, per day">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={messagingMerged} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#e3e8f0" vertical={false} />
              <XAxis dataKey="t" tickFormatter={formatDateShort} tick={{ fill: "#5b6b82", fontSize: 11 }} axisLine={{ stroke: "#e3e8f0" }} tickLine={false} minTickGap={40} />
              <YAxis tick={{ fill: "#5b6b82", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
              <Tooltip labelFormatter={(l) => formatDateShort(String(l))} contentStyle={{ borderRadius: 12, border: "1px solid #e3e8f0", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="emailSent" name="Email sent" stroke="#f26b22" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="emailFailed" name="Email failed" stroke="#e34948" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="smsSent" name="SMS sent" stroke="#2a78d6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="smsFailed" name="SMS failed" stroke="#eda100" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top failure reasons">
          <HorizontalBarList rows={data.messaging.topFailureReasons} />
        </Card>
        <Card title="Security">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["Staff sign-ins", data.security.staffSignIns],
              ["Failed sign-ins", data.security.failedSignIns],
              ["Password resets", data.security.passwordResets],
              ["Codes requested", data.security.codesRequested],
              ["Codes verified", data.security.codesVerified],
              ["Rate-limit hits", data.security.rateLimitHits],
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
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartFrame
            title="Errors (4xx/5xx) per day"
            ariaLabel="Line chart of API errors per day"
            chart={<LineSeries points={data.api.errors.points} color="#e34948" showPrevious={false} />}
            tableColumns={[
              { key: "t", label: "Date" },
              { key: "value", label: "Errors", align: "right" },
            ]}
            tableRows={data.api.errors.points}
            tableFilename="operations-api-errors"
            height="h-48"
          />
          <DataTable
            filename="operations-slowest-endpoints"
            rows={data.api.slowest}
            columns={[
              { key: "route", label: "Endpoint" },
              { key: "p95", label: "p95 (ms)", align: "right" },
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
