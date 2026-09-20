"use client";

import { useScreen } from "@/lib/analytics/api";
import { ScreenFallback } from "@/components/analytics/ScreenState";
import { KpiGrid } from "@/components/analytics/KpiTile";
import { Card } from "@/components/analytics/Card";
import { DataTable } from "@/components/analytics/DataTable";
import { HorizontalBarList } from "@/components/analytics/charts/HorizontalBarList";
import { formatNumber, formatPercent, formatDuration } from "@/lib/analytics/format";
import type { GlobalQuery, CoursesData } from "@/lib/analytics/types";

export function CoursesScreen({ query }: { query: GlobalQuery }) {
  const { envelope, loading, error, refresh } = useScreen<CoursesData>("courses", query);
  if (!envelope) return <ScreenFallback loading={loading} error={error} onRetry={refresh} />;
  const { data } = envelope;

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
        <Card title="Lead sources" subtitle="Where course leads came from">
          <HorizontalBarList rows={data.bySource} />
        </Card>
        <Card title="Counsellor performance" padded={false}>
          <DataTable
            filename="courses-counsellors"
            rows={data.counsellors}
            columns={[
              { key: "name", label: "Counsellor" },
              { key: "leadsHandled", label: "Leads handled", align: "right" },
              { key: "medianTimeToFirstContact", label: "Median time to contact", align: "right", render: (r: any) => formatDuration(r.medianTimeToFirstContact) },
              { key: "enrolmentRate", label: "Enrolment rate", align: "right", render: (r: any) => formatPercent(r.enrolmentRate) },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
