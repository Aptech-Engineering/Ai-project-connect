"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { SeriesPoint } from "@/lib/analytics/types";
import { formatDateShort } from "@/lib/analytics/format";

export function ColumnSeries({
  points,
  color = "#f26b22",
  valueFormatter,
}: {
  points: SeriesPoint[];
  color?: string;
  valueFormatter?: (v: number) => string;
}) {
  const fmt = valueFormatter ?? ((v: number) => String(v));
  const tick = (v: unknown) => fmt(Number(v));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="#e3e8f0" vertical={false} />
        <XAxis
          dataKey="t"
          tickFormatter={formatDateShort}
          tick={{ fill: "#5b6b82", fontSize: 11 }}
          axisLine={{ stroke: "#e3e8f0" }}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis tick={{ fill: "#5b6b82", fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={tick} />
        <Tooltip
          labelFormatter={(l) => formatDateShort(String(l))}
          formatter={(v) => [fmt(Number(v)), "Value"] as [string, string]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e3e8f0", fontSize: 12 }}
        />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
