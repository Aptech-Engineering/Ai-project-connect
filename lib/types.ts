// Types mirroring the API contract, section 9.

export type MetricFormat = "number" | "currency" | "percent" | "duration";
export type GoodDirection = "up" | "down" | "none";
export type MoneyKind = "cash" | "booked" | "estimate" | "liability" | "pending" | null;

export interface Kpi {
  key: string;
  label: string;
  value: number | null;
  previous?: number | null;
  change?: number | null;
  format: MetricFormat;
  goodDirection: GoodDirection;
  kind?: MoneyKind;
  restricted?: boolean;
}

export interface SeriesPoint {
  t: string;
  value: number;
  previous?: number | null;
}

export interface Series {
  key: string;
  label?: string;
  points: SeriesPoint[];
}

export interface BreakdownRow {
  key: string;
  label: string;
  value: number;
  share?: number;
  change?: number | null;
  extra?: Record<string, number>;
}

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  fromPrevious: number | null;
  fromStart: number;
  medianSecondsFromPrevious: number | null;
}

export interface EnvelopeMeta {
  trackingSince: string;
  filters: string[];
  appliedFilters?: Record<string, string>;
  includeInternal?: boolean;
  definitions: Record<string, string>;
}

export interface Envelope<T> {
  range: { from: string; to: string; timezone: string; interval: string };
  compare: { from: string; to: string } | null;
  generatedAt: string;
  meta: EnvelopeMeta;
  data: T;
}

export type Role = "admin" | "staff";

export interface SessionUser {
  id: number;
  name: string;
  role: Role;
}

export interface MeResponse {
  user: SessionUser;
  canViewAnalytics: boolean;
  sections: string[];
  timezone: string;
  currency: string;
  trackingSince: string;
}

export type ScreenKey =
  | "overview"
  | "traffic"
  | "engagement"
  | "funnels"
  | "revenue"
  | "projects"
  | "pipeline"
  | "clients"
  | "courses"
  | "team"
  | "operations"
  | "realtime";

export interface GlobalQuery {
  view: ScreenKey;
  from: string;
  to: string;
  compare: "none" | "previous" | "year";
  interval: "auto" | "hour" | "day" | "week" | "month";
  source?: string;
  device?: string;
  country?: string;
  state?: string;
  category?: string;
  method?: string;
  includeInternal?: "0" | "1";
  funnel?: "application" | "sales" | "portal" | "courses";
}
