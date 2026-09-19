"use client";

import { useState } from "react";
import { Card } from "./Card";
import { DataTable, type Column } from "./DataTable";

// Every chart on the dashboard has a Table view — this is the screen-reader path and
// satisfies the contrast-relief rule in section 11.2. See spec 13.3.
export function ChartFrame<T extends Record<string, any>>({
  title,
  subtitle,
  ariaLabel,
  chart,
  tableColumns,
  tableRows,
  tableFilename,
  isEmpty,
  emptyMessage,
  height = "h-64",
}: {
  title: string;
  subtitle?: string;
  ariaLabel: string;
  chart: React.ReactNode;
  tableColumns: Column<T>[];
  tableRows: T[];
  tableFilename: string;
  isEmpty?: boolean;
  emptyMessage?: string;
  height?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <Card
      title={title}
      subtitle={subtitle}
      padded={false}
      action={
        <div className="flex rounded-lg border border-line p-0.5 text-xs">
          <button
            onClick={() => setView("chart")}
            className={`focus-ring rounded-md px-2 py-1 font-medium ${view === "chart" ? "bg-navy text-white" : "text-muted"}`}
          >
            Chart
          </button>
          <button
            onClick={() => setView("table")}
            className={`focus-ring rounded-md px-2 py-1 font-medium ${view === "table" ? "bg-navy text-white" : "text-muted"}`}
          >
            Table
          </button>
        </div>
      }
    >
      {isEmpty ? (
        <div className="flex h-40 items-center justify-center px-4 pb-4 text-sm text-muted">
          {emptyMessage ?? "No data in this range."}
        </div>
      ) : view === "chart" ? (
        <div role="img" aria-label={ariaLabel} className={`${height} px-2 pb-4`}>
          {chart}
        </div>
      ) : (
        <DataTable columns={tableColumns} rows={tableRows} filename={tableFilename} />
      )}
    </Card>
  );
}
