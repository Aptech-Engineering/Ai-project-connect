import type { GlobalQuery, ScreenKey } from "./types";
import { addDays, todayISO } from "./mock/dates";

export const DATE_PRESETS = [
  "Today",
  "Yesterday",
  "Last 7 days",
  "Last 30 days",
  "Last 90 days",
  "This month",
  "Last month",
  "This year",
  "Custom",
] as const;

export function presetToRange(preset: string): { from: string; to: string } {
  const today = todayISO();
  const now = new Date(today + "T00:00:00");
  switch (preset) {
    case "Today":
      return { from: today, to: today };
    case "Yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "Last 7 days":
      return { from: addDays(today, -6), to: today };
    case "Last 90 days":
      return { from: addDays(today, -89), to: today };
    case "This month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      return { from, to: today };
    }
    case "Last month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
    }
    case "This year": {
      const from = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
      return { from, to: today };
    }
    case "Last 30 days":
    default:
      return { from: addDays(today, -29), to: today };
  }
}

export function parseGlobalQuery(params: URLSearchParams): GlobalQuery {
  const view = (params.get("view") as ScreenKey) || "overview";
  const from = params.get("from") || presetToRange("Last 30 days").from;
  const to = params.get("to") || presetToRange("Last 30 days").to;
  const compare = (params.get("compare") as GlobalQuery["compare"]) || "previous";
  const interval = (params.get("interval") as GlobalQuery["interval"]) || "auto";
  return {
    view,
    from,
    to,
    compare,
    interval,
    source: params.get("source") || undefined,
    device: params.get("device") || undefined,
    country: params.get("country") || undefined,
    state: params.get("state") || undefined,
    category: params.get("category") || undefined,
    method: params.get("method") || undefined,
    includeInternal: (params.get("includeInternal") as "0" | "1") || "0",
    funnel: (params.get("funnel") as GlobalQuery["funnel"]) || "application",
  };
}

export function buildQueryString(query: Partial<GlobalQuery>, base?: URLSearchParams): string {
  const params = new URLSearchParams(base?.toString());
  Object.entries(query).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") {
      params.delete(k);
    } else {
      params.set(k, String(v));
    }
  });
  return "?" + params.toString();
}
