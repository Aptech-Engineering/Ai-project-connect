import { SEQUENTIAL_BLUE } from "@/lib/analytics/palette";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Day-of-week x hour heatmap in sequential blue. Section 6.1 / 12.
export function Heatmap({ data }: { data: number[][] }) {
  const max = Math.max(...data.flat(), 1);
  function colorFor(v: number) {
    const ratio = v / max;
    const idx = Math.min(SEQUENTIAL_BLUE.length - 1, Math.round(ratio * (SEQUENTIAL_BLUE.length - 1)));
    return SEQUENTIAL_BLUE[idx];
  }
  return (
    <div className="table-scroll">
      <div className="inline-grid min-w-[520px]" style={{ gridTemplateColumns: "40px repeat(24, 1fr)" }}>
        <div />
        {Array.from({ length: 24 }).map((_, h) => (
          <div key={h} className="pb-1 text-center text-[9px] text-muted">
            {h % 3 === 0 ? h : ""}
          </div>
        ))}
        {DAYS.map((day, d) => (
          <div key={day} className="contents">
            <div className="flex items-center pr-2 text-[11px] text-muted">{day}</div>
            {Array.from({ length: 24 }).map((_, h) => (
              <div
                key={h}
                title={`${day} ${h}:00 — ${data[d]?.[h] ?? 0} visits`}
                className="m-[1px] h-4 rounded-[3px]"
                style={{ backgroundColor: colorFor(data[d]?.[h] ?? 0) }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
