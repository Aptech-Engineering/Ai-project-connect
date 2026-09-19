"use client";

import { useMemo } from "react";
import { coursesData } from "@/lib/mock/generators";
import { KpiGrid } from "@/components/KpiTile";
import { Card } from "@/components/Card";
import { DataTable } from "@/components/DataTable";
import { HorizontalBarList } from "@/components/charts/HorizontalBarList";
import { formatNumber, formatPercent, formatDuration } from "@/lib/format";
import type { GlobalQuery } from "@/lib/types";

export function CoursesScreen({ query }: { query: GlobalQuery }) {
  const env = useMemo(() => coursesData(query), [query.from, query.to, query.compare]);
  const { data } = env;

  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.kpis} />

      <Card title="Funnel by course" padded={false}>
        <DataTable
          filename="courses-funnel"
          rows={data.byCourse}
          columns={[
            { key: "course", label: "Course" },
            { key: "views", label: "Views", align: "right" },
            { key: "clicks", label: "Clicks", align: "right" },
            { key: "enquiries", label: "Enquiries", align: "right" },
            { key: "contacted", label: "Contacted", align: "right" },
            { key: "enrolled", label: "Enrolled", align: "right" },
            { key: "conversion", label: "Conversion", align: "right", render: (r: any) => formatPercent(r.conversion) },
          ]}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Lead sources">
          <HorizontalBarList rows={data.leadSources} />
        </Card>
        <Card title="Counsellor performance" padded={false}>
          <DataTable
            filename="courses-counsellors"
            rows={data.counsellors}
            columns={[
              { key: "name", label: "Counsellor" },
              { key: "leads", label: "Leads handled", align: "right" },
              { key: "medianTimeToContact", label: "Median time to contact", align: "right", render: (r: any) => formatDuration(r.medianTimeToContact) },
              { key: "enrolmentRate", label: "Enrolment rate", align: "right", render: (r: any) => formatPercent(r.enrolmentRate) },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
