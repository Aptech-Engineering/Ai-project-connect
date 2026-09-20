"use client";

import { useScreen } from "@/lib/analytics/api";
import { ScreenFallback } from "@/components/analytics/ScreenState";
import { KpiGrid } from "@/components/analytics/KpiTile";
import { Card } from "@/components/analytics/Card";
import { DataTable } from "@/components/analytics/DataTable";
import { HorizontalBarList } from "@/components/analytics/charts/HorizontalBarList";
import { formatDuration, formatNumber } from "@/lib/analytics/format";
import type { GlobalQuery, TeamData } from "@/lib/analytics/types";

export function TeamScreen({ query, isAdmin }: { query: GlobalQuery; isAdmin: boolean }) {
  const { envelope, loading, error, refresh } = useScreen<TeamData>("team", query);
  if (!envelope) return <ScreenFallback loading={loading} error={error} onRetry={refresh} />;
  const { data } = envelope;

  const workloadRows = data.workload.map((p) => ({ key: p.name, label: `${p.name} · ${p.role}`, value: p.activeProjects }));

  if (!isAdmin) {
    return (
      <Card>
        <div className="p-6 text-center">
          <p className="font-display text-base font-semibold text-navy">Team is admin-only</p>
          <p className="mt-1 text-sm text-muted">Ask an admin for access, or switch roles from the top bar to preview it.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.kpis} />

      <p className="rounded-xl bg-blue-soft px-4 py-2.5 text-sm text-navy-600">
        Use these numbers to spot overload and slow spots, not to rank people.
      </p>

      <Card title="Per person" padded={false}>
        <DataTable
          filename="team"
          rows={data.people}
          columns={[
            { key: "name", label: "Name" },
            { key: "role", label: "Role" },
            { key: "projects", label: "Projects", align: "right" },
            { key: "updates", label: "Updates", align: "right" },
            { key: "internalNotes", label: "Internal notes", align: "right" },
            { key: "replies", label: "Replies", align: "right" },
            { key: "medianReplyTime", label: "Median reply time", align: "right", render: (r: any) => formatDuration(r.medianReplyTime) },
            { key: "approvalsGiven", label: "Approvals given", align: "right" },
          ]}
        />
      </Card>

      <Card title="Workload" subtitle="Active projects per lead and engineer">
        <HorizontalBarList rows={workloadRows} />
      </Card>
    </div>
  );
}
