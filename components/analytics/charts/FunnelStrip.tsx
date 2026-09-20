import type { FunnelStep } from "@/lib/analytics/types";
import { ORDINAL_BLUE } from "@/lib/analytics/palette";
import { formatNumber, formatPercent, formatDuration } from "@/lib/analytics/format";

// Funnel: horizontal bars in ordinal blue, with conversion % between steps. Section 12.
export function FunnelStrip({ steps }: { steps: FunnelStep[] }) {
  const max = steps[0]?.count || 1;
  return (
    <div className="space-y-3">
      {steps.map((s, i) => {
        const width = Math.max(4, (s.count / max) * 100);
        const color = ORDINAL_BLUE[Math.min(i, ORDINAL_BLUE.length - 1)];
        return (
          <div key={s.key}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-navy">{s.label}</span>
              <span className="tabular-nums text-muted">
                {formatNumber(s.count)}
                {s.fromPrevious !== null && (
                  <span className="ml-2 text-navy-600">{formatPercent(s.fromPrevious)} from previous</span>
                )}
              </span>
            </div>
            <div className="mt-1 h-3 w-full rounded-full bg-mist">
              <div className="h-3 rounded-full transition-all" style={{ width: `${width}%`, backgroundColor: color }} />
            </div>
            {s.medianSecondsFromPrevious !== null && (
              <div className="mt-0.5 text-[11px] text-muted">
                Median {formatDuration(s.medianSecondsFromPrevious)} since previous step
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
