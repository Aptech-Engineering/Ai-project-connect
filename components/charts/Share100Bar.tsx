import type { BreakdownRow } from "@/lib/types";
import { SLOT_COLORS } from "@/lib/palette";
import { formatPercent } from "@/lib/format";

// Share of a whole with <= 4 parts: horizontal 100% bar. Section 12.
export function Share100Bar({ rows }: { rows: BreakdownRow[] }) {
  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full">
        {rows.map((r, i) => (
          <div
            key={r.key}
            style={{ width: `${(r.share ?? 0) * 100}%`, backgroundColor: SLOT_COLORS[((i % 3) + 1) as 1] }}
            title={`${r.label}: ${formatPercent(r.share ?? 0)}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {rows.map((r, i) => (
          <span key={r.key} className="inline-flex items-center gap-1.5 text-navy">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SLOT_COLORS[((i % 3) + 1) as 1] }} />
            {r.label} <span className="tabular-nums text-muted">{formatPercent(r.share ?? 0)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
