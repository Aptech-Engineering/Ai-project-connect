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

export type Role = "admin" | "lead" | "engineer" | "counsellor";

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

/* ---------------- Screen payloads, generated from the live API ---------------- */

export interface OverviewData {
    kpis: Kpi[];
    trend: {
      visitors: Series;
      ideas: Series;
    };
    funnel: FunnelStep[];
    attention: {
      overdue: Array<{
        code: string;
        title: string;
        lead: string;
        stage: string;
        targetDate: string;
        daysOverdue: number;
        link: string;
      }>;
      transfers: Array<{
        reference: string;
        ideaRef: string;
        /** null for viewers who may not see money. */
        amount: number | null;
        since: string;
        daysWaiting: number;
        link: string;
      }>;
      refunds: Array<{
        reference: string;
        ideaRef: string;
        /** null for viewers who may not see money. */
        amount: number | null;
        refundStatus: string;
        queuedAt: string | null;
        link: string;
      }>;
      stale: Array<{
        code: string;
        title: string;
        lead: string;
        daysSinceClientUpdate: number;
        link: string;
      }>;
    };
    topSources: BreakdownRow[];
  }

export interface TrafficData {
    kpis: Kpi[];
    newVsReturning: {
      new: number;
      returning: number;
    };
    heatmap: number[][];
  }

export interface TrafficTimeseriesData {
    series: Series;
  }

export interface TrafficBreakdownData {
    dimension: string;
    rows: BreakdownRow[];
    total: number;
  }

export interface EngagementData {
    kpis: Kpi[];
    interactions: Array<{
      event: string;
      target: string;
      path: string;
      count: number;
      visitors: number;
      ctr: number;
    }>;
    trackerSearches: {
      byKind: {
        project: number;
        idea: number;
      };
      byResult: {
        found: number;
        not_found: number;
        rate_limited: number;
        error: number;
      };
      notFoundRate: number;
    };
    scrollDepth: {
      25: number;
      50: number;
      75: number;
      100: number;
    };
    downloads: Array<{
      kind: string;
      count: number;
    }>;
  }

export interface FunnelData {
    steps: FunnelStep[];
    overall: number;
    breakdown: Array<{
      key: string;
      label: string;
      steps: FunnelStep[];
    }>;
    funnel: string;
    by: string;
    /** Caveats about what this funnel can and cannot show. */
    notes: string[];
  }

export interface RevenueData {
    cash: {
      kpis: Kpi[];
    };
    booked: {
      kpis: Kpi[];
    };
    series: {
      netFees: Series;
    };
    byMethod: BreakdownRow[];
    refunds: {
      count: number;
      amount: number;
      medianDaysToRefund?: number | null;
    };
    quotes: {
      series: Series[];
      acceptanceRate?: number | null;
    };
    ledger: Array<{
      date: string;
      paidAt: string;
      reference: string;
      receiptNo: string;
      ideaRef: string;
      method: string;
      amount: number;
      status: string;
      refundStatus: string;
    }>;
    page: number;
    pages: number;
    ledgerTotal: number;
  }

export interface ProjectsData {
    kpis: Kpi[];
    byStage: BreakdownRow[];
    timeInStage: Array<{
      key: string;
      label: string;
      medianDays: number;
      samples: number;
    }>;
    deliveryVsTarget: Array<{
      code: string;
      title: string;
      daysEarlyOrLate: number;
    }>;
    updateFrequency: Array<{
      code: string;
      title: string;
      updates: number;
      daysSinceLastUpdate: number;
      stale: boolean;
    }>;
    table: Array<{
      code: string;
      title: string;
      lead: string;
      stage: string;
      stageLabel: string;
      progress: number;
      targetDate: string;
      daysOverdue: number;
      lastClientUpdate: string;
      rating?: number | null;
    }>;
  }

export interface PipelineData {
    kpis: Kpi[];
    series: {
      submitted: {
        online: Series;
        walkIn: Series;
      };
    };
    by: {
      category: BreakdownRow[];
      platform: BreakdownRow[];
      budget: BreakdownRow[];
      state: BreakdownRow[];
    };
    ageing: BreakdownRow[];
    table: Array<{
      ref: string;
      title: string;
      category: string;
      source: string;
      submittedAt: string;
      feeStatus: string;
      stage: string;
      daysWaiting: number;
    }>;
  }

export interface ClientsData {
    kpis: Kpi[];
    series: {
      signIns: Series;
    };
    engagement: {
      approvals: number;
      changeRequests: number;
      uploads: number;
      courseRequests: number;
      ratings: number;
    };
    optOuts: {
      digest: number;
      promos: number;
    };
    byLocation: BreakdownRow[];
  }

export interface CoursesData {
    kpis: Kpi[];
    byCourse: Array<{
      courseId: string;
      course: string;
      views: number;
      clicks: number;
      enquiries: number;
      contacted: number;
      enrolled: number;
      conversion: number;
    }>;
    bySource: BreakdownRow[];
    counsellors: Array<{
      name: string;
      leadsHandled: number;
      medianTimeToFirstContact: number | null;
      enrolmentRate: number | null;
    }>;
  }

export interface TeamData {
    caption: string;
    kpis: Kpi[];
    people: Array<{
      name: string;
      role: string;
      projects: number;
      updates: number;
      internalNotes: number;
      replies: number;
      medianReplyTime: number;
      approvalsGiven: number;
    }>;
    workload: Array<{
      name: string;
      role: string;
      activeProjects: number;
    }>;
  }

export interface OperationsData {
    messaging: {
      series: Series[];
      byChannel: {
        email: {
          sent: number;
          logged: number;
          failed: number;
          queued: number;
        };
        sms: {
          sent: number;
          logged: number;
          failed: number;
          queued: number;
        };
      };
      failureRate?: number | null;
      topErrors: Array<{
        error: string;
        count: number;
      }>;
    };
    payments: {
      attempts: number;
      successRate: number;
      abandoned: number;
      medianConfirmHours?: number | null;
    };
    security: {
      staffSignIns: number;
      failedSignIns: number;
      passwordResets: number;
      codesRequested: number;
      codesVerified: number;
      rateLimited: number;
    };
    api: {
      errors: Array<{
        t: string;
        serverErrors: number;
        clientErrors: number;
      }>;
      slowest: Array<{
        route: string;
        method: string;
        p95Ms: number;
        medianMs: number;
        requests: number;
      }>;
    };
  }

export interface RealtimeData {
    activeVisitors: number;
    perMinute: Array<{
      t: string;
      value: number;
    }>;
    topPages: BreakdownRow[];
    topSources: BreakdownRow[];
    devices: BreakdownRow[];
    feed: Array<{
      at: string;
      event: string;
      path: string | null;
      source: string | null;
      device: string | null;
    }>;
  }

