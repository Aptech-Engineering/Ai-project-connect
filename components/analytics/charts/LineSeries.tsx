"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { SeriesPoint } from "@/lib/analytics/types";
import { formatDateShort } from "@/lib/analytics/format";

export function LineSeries({
  points,
  color = "#f26b22",
  showPrevious = true,
  valueFormatter,
}: {
  points: SeriesPoint[];
  color?: string;
  showPrevious?: boolean;
  valueFormatter?: (v: number) => string;
}) {
  const fmt = valueFormatter ?? ((v: number) => String(v));
  const tick = (v: unknown) => fmt(Number(v));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="#e3e8f0" vertical={false} />
        <XAxis
          dataKey="t"
          tickFormatter={formatDateShort}
          tick={{ fill: "#5b6b82", fontSize: 11 }}
          axisLine={{ stroke: "#e3e8f0" }}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          tick={{ fill: "#5b6b82", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={tick}
        />
        <Tooltip
          labelFormatter={(l) => formatDateShort(String(l))}
          formatter={(v, name) => [fmt(Number(v)), String(name) === "value" ? "Current" : "Comparison"] as [string, string]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e3e8f0", fontSize: 12 }}
        />
        {showPrevious && (
          <Line
            type="monotone"
            dataKey="previous"
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            strokeOpacity={0.6}
            dot={false}
          />
        )}
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
