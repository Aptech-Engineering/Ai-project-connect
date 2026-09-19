import type { BreakdownRow } from "@/lib/types";
import { SLOT_COLORS } from "@/lib/palette";
import { formatByKind, formatPercent } from "@/lib/format";

// Ranking chart: horizontal bars, sorted, top N + Other. Section 12.
export function HorizontalBarList({
  rows,
  format = "number",
  topN = 7,
}: {
  rows: BreakdownRow[];
  format?: "number" | "currency";
  topN?: number;
}) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const visible = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const restTotal = rest.reduce((a, r) => a + r.value, 0);
  const finalRows = rest.length ? [...visible, { key: "other", label: "Other", value: restTotal, share: rest.reduce((a, r) => a + (r.share ?? 0), 0) }] : visible;
  const max = Math.max(...finalRows.map((r) => r.value), 1);

  return (
    <div className="space-y-2.5">
      {finalRows.map((row, i) => {
        const color = row.key === "other" ? SLOT_COLORS.other : SLOT_COLORS[((i % 8) + 1) as 1];
        const width = Math.max(3, (row.value / max) * 100);
        return (
          <div key={row.key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-navy">{row.label}</span>
              <span className="tabular-nums text-muted">
                {formatByKind(row.value, format, true)}
                {row.share !== undefined ? ` · ${formatPercent(row.share)}` : ""}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-mist">
              <div className="h-2 rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
