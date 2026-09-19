"use client";

import { useMemo } from "react";
import { teamData } from "@/lib/mock/generators";
import { KpiGrid } from "@/components/KpiTile";
import { Card } from "@/components/Card";
import { DataTable } from "@/components/DataTable";
import { HorizontalBarList } from "@/components/charts/HorizontalBarList";
import { formatDuration, formatNumber } from "@/lib/format";
import type { GlobalQuery } from "@/lib/types";

export function TeamScreen({ query, isAdmin }: { query: GlobalQuery; isAdmin: boolean }) {
  const env = useMemo(() => teamData(query, isAdmin), [query.from, query.to, query.compare, isAdmin]);
  const { data } = env;

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
        <HorizontalBarList rows={data.workload} />
      </Card>
    </div>
  );
}
