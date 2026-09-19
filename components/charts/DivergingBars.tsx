import { DIVERGING } from "@/lib/palette";

// Days early/late vs target. Section 12.
export function DivergingBars({ rows }: { rows: { code: string; title: string; daysEarlyLate: number }[] }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.daysEarlyLate)), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const isLate = r.daysEarlyLate > 0;
        const width = (Math.abs(r.daysEarlyLate) / max) * 50;
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
              {isLate ? `+${r.daysEarlyLate}d` : `${r.daysEarlyLate}d`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
