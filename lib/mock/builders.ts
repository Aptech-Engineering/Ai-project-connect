import { rngFor, pickInt, pickFloat } from "./rng";
import { listDays, daysBetween } from "./dates";
import type { Kpi, Series, BreakdownRow, FunnelStep, MetricFormat, GoodDirection, MoneyKind } from "../types";

export function kpi(
  seed: string,
  key: string,
  label: string,
  base: number,
  volatility: number,
  format: MetricFormat,
  goodDirection: GoodDirection,
  kind: MoneyKind = null,
  restricted = false
): Kpi {
  const rng = rngFor(seed + key);
  const value = Math.max(0, Math.round(base * pickFloat(rng, 1 - volatility, 1 + volatility)));
  const previous = Math.max(0, Math.round(value * pickFloat(rng, 0.75, 1.2)));
  const change = previous === 0 ? 0 : (value - previous) / previous;
  if (restricted) {
    return { key, label, value: null, previous: null, change: null, format, goodDirection, kind, restricted: true };
  }
  return { key, label, value, previous, change, format, goodDirection, kind };
}

export function series(
  seed: string,
  key: string,
  from: string,
  to: string,
  base: number,
  volatility: number,
  withPrevious = true,
  trend = 0
): Series {
  const days = listDays(from, to);
  const rng = rngFor(seed + key);
  const weekday = (iso: string) => new Date(iso + "T00:00:00").getDay();
  const points = days.map((t, i) => {
    const weekendDip = weekday(t) === 0 || weekday(t) === 6 ? 0.6 : 1;
    const trendFactor = 1 + trend * (i / Math.max(1, days.length - 1));
    const value = Math.max(0, Math.round(base * weekendDip * trendFactor * pickFloat(rng, 1 - volatility, 1 + volatility)));
    const previous = withPrevious
      ? Math.max(0, Math.round(value * pickFloat(rng, 0.8, 1.15)))
      : undefined;
    return { t, value, previous };
  });
  return { key, points };
}

export function breakdown(
  seed: string,
  rowsDef: { key: string; label: string }[],
  totalBase: number,
  withExtra?: (rng: () => number) => Record<string, number>
): BreakdownRow[] {
  const rng = rngFor(seed + "breakdown" + rowsDef.map((r) => r.key).join(","));
  // weighted shares that sum to ~1, front-loaded (first rows get bigger share)
  const weights = rowsDef.map((_, i) => pickFloat(rng, 0.4, 1) / (i + 1));
  const sumW = weights.reduce((a, b) => a + b, 0);
  return rowsDef.map((r, i) => {
    const share = weights[i] / sumW;
    const value = Math.round(totalBase * share);
    const change = pickFloat(rng, -0.25, 0.35);
    return {
      key: r.key,
      label: r.label,
      value,
      share,
      change,
      extra: withExtra ? withExtra(rng) : undefined,
    };
  });
}

export function funnelSteps(seed: string, stepsDef: { key: string; label: string }[], startCount: number): FunnelStep[] {
  const rng = rngFor(seed + "funnel");
  let count = startCount;
  return stepsDef.map((s, i) => {
    if (i > 0) {
      const dropRate = pickFloat(rng, 0.12, 0.42);
      count = Math.max(1, Math.round(count * (1 - dropRate)));
    }
    const fromPrevious = i === 0 ? null : 1 - pickFloat(rng, 0.12, 0.42);
    const fromStart = count / startCount;
    const medianSecondsFromPrevious = i === 0 ? null : pickInt(rng, 600, 259200);
    return { key: s.key, label: s.label, count, fromPrevious, fromStart, medianSecondsFromPrevious };
  });
}

export function daysInRange(from: string, to: string) {
  return daysBetween(from, to);
}
