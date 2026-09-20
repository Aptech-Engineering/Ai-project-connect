import { DIVERGING } from "@/lib/analytics/palette";

// Days early/late vs target. Section 12.
export function DivergingBars({ rows }: { rows: { code: string; title: string; daysEarlyOrLate: number }[] }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.daysEarlyOrLate)), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const isLate = r.daysEarlyOrLate > 0;
        const width = (Math.abs(r.daysEarlyOrLate) / max) * 50;
        return (
          <div key={r.code} className="flex items-center gap-2 text-xs">
            <div className="w-32 shrink-0 truncate text-navy" title={r.title}>
              {r.code}
            </div>
            <div className="relative h-3 flex-1">
              <div className="absolute left-1/2 top-0 h-3 w-px bg-line" />
              <div
                className="absolute top-0 h-3 rounded-sm"
                style={{
                  width: `${width}%`,
                  backgroundColor: isLate ? DIVERGING.late : DIVERGING.early,
                  left: isLate ? "50%" : `${50 - width}%`,
                }}
              />
            </div>
            <div className="w-16 shrink-0 text-right tabular-nums text-muted">
              {isLate ? `+${r.daysEarlyOrLate}d` : `${r.daysEarlyOrLate}d`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
