"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { funnelData } from "@/lib/mock/generators";
import { Card } from "@/components/Card";
import { FunnelStrip } from "@/components/charts/FunnelStrip";
import { DataTable } from "@/components/DataTable";
import { formatNumber, formatPercent, formatDuration } from "@/lib/format";
import { buildQueryString } from "@/lib/urlState";
import type { GlobalQuery } from "@/lib/types";

const FUNNELS = [
  { key: "application", label: "Application" },
  { key: "sales", label: "Sales" },
  { key: "portal", label: "Portal" },
  { key: "courses", label: "Courses" },
];

const DIMENSIONS = [
  { key: "source", label: "Source" },
  { key: "device", label: "Device" },
  { key: "category", label: "Category" },
];

export function FunnelsScreen({ query }: { query: GlobalQuery }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [by, setBy] = useState("source");
  const funnelId = query.funnel ?? "application";

  const env = useMemo(() => funnelData(query, funnelId, by), [query.from, query.to, funnelId, by]);
  const { data } = env;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {FUNNELS.map((f) => (
          <button
            key={f.key}
            onClick={() => router.push(pathname + buildQueryString({ funnel: f.key as any }, searchParams))}
            className={`focus-ring rounded-full px-3.5 py-1.5 text-sm font-medium ${
              funnelId === f.key ? "bg-navy text-white" : "border border-line bg-white text-navy hover:border-navy-600"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card
        title={`${FUNNELS.find((f) => f.key === funnelId)?.label} funnel`}
        subtitle={`Overall conversion: ${formatPercent(data.overall)}`}
      >
        <FunnelStrip steps={data.steps} />
      </Card>

      <Card title="Breakdown" subtitle="Same funnel, split by">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {DIMENSIONS.map((d) => (
            <button
              key={d.key}
              onClick={() => setBy(d.key)}
              className={`focus-ring rounded-full px-3 py-1 text-xs font-medium ${
                by === d.key ? "bg-navy text-white" : "border border-line text-muted hover:text-navy"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        {data.notes ? (
          <p className="rounded-xl bg-mist p-3 text-sm text-muted">{data.notes[0]}</p>
        ) : (
          <DataTable
            filename={`funnel-${funnelId}-${by}`}
            rows={data.breakdown}
            columns={[
              { key: "label", label: DIMENSIONS.find((d) => d.key === by)?.label ?? "Segment" },
              ...data.steps.map((s, i) => ({
                key: `step${i}`,
                label: s.label,
                align: "right" as const,
                render: (r: any) => formatNumber(r.steps[i]?.count),
                sortValue: (r: any) => r.steps[i]?.count ?? 0,
              })),
            ]}
          />
        )}
      </Card>
    </div>
  );
}
