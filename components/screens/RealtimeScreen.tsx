"use client";

import { useEffect, useState } from "react";
import { realtimeData } from "@/lib/mock/generators";
import { Card } from "@/components/Card";
import { HorizontalBarList } from "@/components/charts/HorizontalBarList";
import { formatNumber } from "@/lib/format";

export function RealtimeScreen() {
  const [tick, setTick] = useState(() => realtimeData());
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    function onVis() {
      setVisible(document.visibilityState === "visible");
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setTick(realtimeData()), 15000);
    return () => clearInterval(id);
  }, [visible]);

  const { data } = tick;
  const maxPerMinute = Math.max(...data.perMinute.map((p) => p.value), 1);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="h-2 w-2 rounded-full bg-teal animate-pulse" />
        Refreshes every 15s while this tab is visible {visible ? "" : "(paused — tab hidden)"}
      </div>

      <Card>
        <div className="text-center">
          <div className="text-xs font-medium text-muted">Active visitors — last 5 minutes</div>
          <div className="mt-1 font-display text-5xl font-semibold text-navy tabular-nums">{data.activeVisitors}</div>
        </div>
      </Card>

      <Card title="Last 30 minutes" subtitle="Page views per minute">
        <div className="flex h-32 items-end gap-1">
          {data.perMinute.map((p, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm bg-brand"
              style={{ height: `${Math.max(4, (p.value / maxPerMinute) * 100)}%` }}
              title={`${p.value} views`}
            />
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Top pages">
          <HorizontalBarList rows={data.topPages} topN={5} />
        </Card>
        <Card title="Top sources">
          <HorizontalBarList rows={data.topSources} topN={5} />
        </Card>
        <Card title="Devices">
          <HorizontalBarList rows={data.devices} topN={5} />
        </Card>
      </div>

      <Card title="Live feed" subtitle="Last 50 events, anonymised — no visitor ids and no IPs" padded={false}>
        <div className="table-scroll max-h-96 overflow-y-auto px-4 pb-4">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="sticky top-0 border-b border-line bg-white text-left text-muted">
                <th className="py-2 pr-4 font-medium">Time</th>
                <th className="py-2 pr-4 font-medium">Event</th>
                <th className="py-2 pr-4 font-medium">Page</th>
                <th className="py-2 pr-4 font-medium">Source</th>
                <th className="py-2 pr-4 font-medium">Device</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {data.feed.map((e, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="py-1.5 pr-4 text-muted">{e.time}s ago</td>
                  <td className="py-1.5 pr-4 text-navy">{e.event}</td>
                  <td className="py-1.5 pr-4 text-navy">{e.path}</td>
                  <td className="py-1.5 pr-4 text-navy">{e.source}</td>
                  <td className="py-1.5 pr-4 text-navy">{e.device}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
