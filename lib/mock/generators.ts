import { kpi, series, breakdown, funnelSteps, daysInRange } from "./builders";
import { rngFor, pickInt, pickFloat } from "./rng";
import { addDays } from "./dates";
import type { Envelope, GlobalQuery } from "../types";

type Range = Pick<GlobalQuery, "from" | "to" | "compare">;

function meta(query: Range, filters: string[], definitions: Record<string, string>) {
  return {
    trackingSince: "2026-06-20",
    filters,
    includeInternal: false,
    definitions,
  };
}

function envelope<T>(query: Range, data: T, filters: string[], definitions: Record<string, string>): Envelope<T> {
  return {
    range: { from: query.from, to: query.to, timezone: "Africa/Lagos", interval: daysInRange(query.from, query.to) > 90 ? "week" : "day" },
    compare: query.compare === "none" ? null : { from: addDays(query.from, -daysInRange(query.from, query.to)), to: addDays(query.from, -1) },
    generatedAt: new Date().toISOString(),
    meta: meta(query, filters, definitions),
    data,
  };
}

const SEED = "apc-analytics-v1";

// ---------- Overview ----------
export function overviewData(q: Range) {
  const kpis = [
    kpi(SEED, "visitors", "Visitors", 4200, 0.18, "number", "up"),
    kpi(SEED, "ideasSubmitted", "Ideas submitted", 86, 0.2, "number", "up"),
    kpi(SEED, "feeRevenueNet", "Fee revenue (net)", 158000, 0.15, "currency", "up", "cash"),
    kpi(SEED, "bookedValue", "Booked contract value", 4820000, 0.22, "currency", "up", "booked"),
    kpi(SEED, "activeProjects", "Active projects", 34, 0.1, "number", "none"),
    kpi(SEED, "onTimeRate", "On-time delivery rate", 0.812, 0.08, "percent", "up"),
  ];
  const trendVisitors = series(SEED, "overviewVisitors", q.from, q.to, 150, 0.3, true, 0.15);
  const trendIdeas = series(SEED, "overviewIdeas", q.from, q.to, 3.5, 0.5, true, 0.1);
  const steps = funnelSteps(
    SEED,
    [
      { key: "visited", label: "Visitors" },
      { key: "opened", label: "Idea form opened" },
      { key: "feePaid", label: "Fee paid" },
      { key: "submitted", label: "Submitted" },
      { key: "quoted", label: "Quoted" },
      { key: "accepted", label: "Accepted" },
    ],
    4200
  );
  const rng = rngFor(SEED + "attention");
  const attention = {
    overdue: Array.from({ length: 4 }).map((_, i) => ({
      id: 900 + i,
      title: `Project #${900 + i} — ${["E-commerce build", "Booking portal", "Inventory app", "Landing site"][i]}`,
      daysOverdue: pickInt(rng, 1, 12),
      link: "/engineering",
    })),
    transfers: Array.from({ length: 3 }).map((_, i) => ({
      id: 400 + i,
      reference: `TRF-${1000 + i}`,
      amount: pickInt(rng, 1800, 2000),
      hoursWaiting: pickInt(rng, 2, 48),
      link: "/engineering",
    })),
    refunds: Array.from({ length: 2 }).map((_, i) => ({
      id: 220 + i,
      reference: `RFD-${500 + i}`,
      amount: 2000,
      daysWaiting: pickInt(rng, 1, 6),
      link: "/engineering",
    })),
    stale: Array.from({ length: 3 }).map((_, i) => ({
      id: 700 + i,
      title: `Project #${700 + i} — ${["CRM dashboard", "School portal", "POS system"][i]}`,
      daysSinceUpdate: pickInt(rng, 5, 14),
      link: "/engineering",
    })),
  };
  const topSources = breakdown(
    SEED,
    [
      { key: "google", label: "Google (search)" },
      { key: "direct", label: "Direct" },
      { key: "instagram", label: "Instagram (social)" },
      { key: "facebook", label: "Facebook (social)" },
      { key: "referral", label: "Referral" },
    ],
    4200,
    (r) => ({ conversion: pickFloat(r, 0.008, 0.06) })
  );
  return envelope(
    q,
    { kpis, trend: { visitors: trendVisitors, ideas: trendIdeas }, funnel: steps, attention, topSources },
    [],
    {
      visitors: "Distinct visitor ids with at least one event in the range.",
      onTimeRate: "Delivered projects in range with delivered_at ≤ target_date, divided by delivered in range.",
    }
  );
}

// ---------- Traffic ----------
export function trafficData(q: Range) {
  const kpis = [
    kpi(SEED, "trafficVisitors", "Visitors", 4200, 0.18, "number", "up"),
    kpi(SEED, "sessions", "Sessions", 5100, 0.18, "number", "up"),
    kpi(SEED, "pageviews", "Page views", 15600, 0.2, "number", "up"),
    kpi(SEED, "pagesPerSession", "Pages per session", 3.1, 0.1, "number", "up"),
    kpi(SEED, "avgDuration", "Avg. session duration", 185, 0.2, "duration", "up"),
    kpi(SEED, "bounceRate", "Bounce rate", 0.386, 0.12, "percent", "down"),
  ];
  const rng = rngFor(SEED + "newvret");
  const newVisitors = pickInt(rng, 55, 70);
  const heatmap: number[][] = Array.from({ length: 7 }).map((_, day) =>
    Array.from({ length: 24 }).map((_, hour) => {
      const workHour = hour >= 8 && hour <= 21 ? 1 : 0.25;
      const weekday = day >= 1 && day <= 5 ? 1 : 0.6;
      const r = rngFor(SEED + "hm" + day + hour)();
      return Math.round(20 * workHour * weekday * (0.5 + r));
    })
  );
  return envelope(
    q,
    {
      kpis,
      newVsReturning: { new: newVisitors, returning: 100 - newVisitors },
      heatmap,
    },
    ["source", "medium", "campaign", "device", "country", "state"],
    { bounceRate: "Sessions with exactly one page view and no other interaction event, divided by sessions." }
  );
}

export function trafficTimeseries(q: Range, metric: string) {
  const bases: Record<string, [number, number, MetricFormatKey]> = {
    visitors: [150, 0.3, "number"],
    sessions: [182, 0.28, "number"],
    pageviews: [560, 0.32, "number"],
    bounce_rate: [0.38, 0.15, "percent"],
    duration: [185, 0.2, "duration"],
  };
  const [base, vol] = bases[metric] ?? bases.visitors;
  const s = series(SEED, "ts_" + metric, q.from, q.to, base, vol, true, 0.1);
  return envelope(q, { series: s }, [], {});
}

type MetricFormatKey = "number" | "percent" | "duration";

const DIMENSION_ROWS: Record<string, { key: string; label: string }[]> = {
  source: [
    { key: "google", label: "Google" },
    { key: "direct", label: "Direct" },
    { key: "instagram", label: "Instagram" },
    { key: "facebook", label: "Facebook" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "referral", label: "Referral" },
  ],
  medium: [
    { key: "organic", label: "Organic" },
    { key: "social", label: "Social" },
    { key: "referral", label: "Referral" },
    { key: "cpc", label: "Paid (CPC)" },
    { key: "email", label: "Email" },
  ],
  campaign: [
    { key: "sept-intake", label: "September intake" },
    { key: "web-dev-promo", label: "Web dev promo" },
    { key: "career-fair", label: "Career fair" },
    { key: "none", label: "(none)" },
  ],
  referrer: [
    { key: "google.com", label: "google.com" },
    { key: "instagram.com", label: "instagram.com" },
    { key: "facebook.com", label: "facebook.com" },
    { key: "ng.linkedin.com", label: "ng.linkedin.com" },
  ],
  landing_page: [
    { key: "/", label: "/ (home)" },
    { key: "/apply", label: "/apply" },
    { key: "/courses", label: "/courses" },
    { key: "/track", label: "/track" },
  ],
  page: [
    { key: "/", label: "/ (home)" },
    { key: "/courses", label: "/courses" },
    { key: "/apply", label: "/apply" },
    { key: "/track", label: "/track" },
    { key: "/about", label: "/about" },
  ],
  device: [
    { key: "mobile", label: "Mobile" },
    { key: "desktop", label: "Desktop" },
    { key: "tablet", label: "Tablet" },
  ],
  browser: [
    { key: "chrome", label: "Chrome" },
    { key: "safari", label: "Safari" },
    { key: "samsung", label: "Samsung Internet" },
    { key: "firefox", label: "Firefox" },
  ],
  os: [
    { key: "android", label: "Android" },
    { key: "ios", label: "iOS" },
    { key: "windows", label: "Windows" },
    { key: "macos", label: "macOS" },
  ],
  country: [
    { key: "NG", label: "Nigeria" },
    { key: "GH", label: "Ghana" },
    { key: "GB", label: "United Kingdom" },
    { key: "US", label: "United States" },
  ],
  state: [
    { key: "Kaduna", label: "Kaduna" },
    { key: "Lagos", label: "Lagos" },
    { key: "Abuja (FCT)", label: "Abuja (FCT)" },
    { key: "Kano", label: "Kano" },
    { key: "Plateau", label: "Plateau" },
  ],
};

export function trafficBreakdown(q: Range, dimension: string) {
  const rows = DIMENSION_ROWS[dimension] ?? DIMENSION_ROWS.source;
  const rowsOut = breakdown(SEED, rows, 4200);
  return envelope(q, { rows: rowsOut, total: rowsOut.reduce((a, r) => a + r.value, 0) }, [], {});
}

// ---------- Engagement ----------
export function engagementData(q: Range) {
  const kpis = [
    kpi(SEED, "ctaClicks", "CTA clicks", 1860, 0.2, "number", "up"),
    kpi(SEED, "trackerSearches", "Tracker searches", 640, 0.22, "number", "up"),
    kpi(SEED, "ideaFormsOpened", "Idea forms opened", 310, 0.18, "number", "up"),
    kpi(SEED, "courseClicks", "Course clicks", 420, 0.2, "number", "up"),
    kpi(SEED, "outboundClicks", "Outbound clicks", 205, 0.25, "number", "none"),
  ];
  const interactions = breakdown(
    SEED,
    [
      { key: "hero_submit_idea", label: "Hero — submit idea" },
      { key: "nav_submit_idea", label: "Nav — submit idea" },
      { key: "hero_track", label: "Hero — track project" },
      { key: "course_enrol", label: "Course — enrol" },
      { key: "flier_cta", label: "Flier CTA" },
      { key: "portal_learn_this", label: "Portal — learn this" },
    ],
    1860,
    (r) => ({ ctr: pickFloat(r, 0.02, 0.22) })
  ).map((row) => ({ ...row, extra: { visitors: Math.round(row.value * 0.82), ctr: row.extra?.ctr ?? 0 } }));
  const trackerSearches = breakdown(
    SEED,
    [
      { key: "found", label: "Found" },
      { key: "not_found", label: "Not found" },
      { key: "rate_limited", label: "Rate limited" },
    ],
    640
  );
  const scrollDepth = { d25: 0.82, d50: 0.58, d75: 0.34, d100: 0.16 };
  const downloads = breakdown(
    SEED,
    [
      { key: "report", label: "Report PDFs" },
      { key: "proposal", label: "Proposals" },
      { key: "file", label: "Shared files" },
    ],
    140
  );
  return envelope(q, { kpis, interactions, trackerSearches, scrollDepth, downloads }, [], {});
}

// ---------- Funnels ----------
export const FUNNEL_DEFS: Record<string, { key: string; label: string }[]> = {
  application: [
    { key: "visited", label: "Visited" },
    { key: "opened", label: "Opened idea form" },
    { key: "draft_saved", label: "Draft saved" },
    { key: "reached_payment", label: "Reached payment" },
    { key: "fee_paid", label: "Fee paid (or transfer reported)" },
    { key: "submitted", label: "Submitted" },
  ],
  sales: [
    { key: "submitted", label: "Submitted" },
    { key: "reviewed", label: "Reviewed" },
    { key: "quote_sent", label: "Quote sent" },
    { key: "quote_accepted", label: "Quote accepted" },
    { key: "project_started", label: "Project started" },
    { key: "delivered", label: "Delivered" },
  ],
  portal: [
    { key: "tracker_search", label: "Tracker search" },
    { key: "code_requested", label: "Code requested" },
    { key: "code_verified", label: "Code verified (signed in)" },
    { key: "returned_30d", label: "Returned within 30 days" },
  ],
  courses: [
    { key: "viewed", label: "Course viewed" },
    { key: "clicked", label: "Course clicked" },
    { key: "enquiry", label: "Enquiry / request" },
    { key: "contacted", label: "Contacted" },
    { key: "enrolled", label: "Enrolled" },
  ],
};

const FUNNEL_START: Record<string, number> = { application: 4200, sales: 86, portal: 640, courses: 980 };

export function funnelData(q: Range, id: string, by: string) {
  const def = FUNNEL_DEFS[id] ?? FUNNEL_DEFS.application;
  const steps = funnelSteps(SEED, def, FUNNEL_START[id] ?? 500);
  const overall = steps[steps.length - 1].fromStart;
  const dims: Record<string, { key: string; label: string }[]> = {
    source: DIMENSION_ROWS.source,
    device: DIMENSION_ROWS.device,
    category: [
      { key: "web-dev", label: "Web development" },
      { key: "mobile-app", label: "Mobile app" },
      { key: "data", label: "Data & analytics" },
      { key: "design", label: "Design" },
    ],
  };
  const rows = dims[by] ?? dims.source;
  const notes: string[] = [];
  if ((id === "application" || id === "portal") && by === "category") {
    notes.push("Category breakdown is not available for this funnel — it is counted from tracked visitors only.");
  }
  const breakdownRows = notes.length
    ? []
    : rows.map((r) => ({ key: r.key, label: r.label, steps: funnelSteps(SEED + r.key, def, Math.round((FUNNEL_START[id] ?? 500) * pickFloat(rngFor(SEED + r.key), 0.08, 0.35))) }));
  return envelope(q, { steps, overall, breakdown: breakdownRows, notes: notes.length ? notes : undefined }, [], {});
}

// ---------- Revenue (admin only) ----------
export function revenueData(q: Range, isAdmin: boolean) {
  const cash = {
    kpis: [
      kpi(SEED, "feesGross", "Fees collected (gross)", 172000, 0.15, "currency", "up", "cash", !isAdmin),
      kpi(SEED, "refunded", "Refunded", 14000, 0.3, "currency", "down", "cash", !isAdmin),
      kpi(SEED, "netFeeRevenue", "Net fee revenue", 158000, 0.15, "currency", "up", "cash", !isAdmin),
      kpi(SEED, "awaitingConfirmation", "Transfers awaiting confirmation", 6000, 0.4, "currency", "none", "pending", !isAdmin),
    ],
  };
  const booked = {
    kpis: [
      kpi(SEED, "contractValueWon", "Contract value won", 4820000, 0.22, "currency", "up", "booked", !isAdmin),
      kpi(SEED, "approvedChanges", "Approved change requests", 640000, 0.3, "currency", "up", "booked", !isAdmin),
      kpi(SEED, "supportMRR", "Support plan MRR", 310000, 0.1, "currency", "up", "booked", !isAdmin),
      kpi(SEED, "estCourseRevenue", "Estimated course revenue", 890000, 0.2, "currency", "up", "estimate", !isAdmin),
    ],
  };
  const netFees = series(SEED, "netFees", q.from, q.to, 5200, 0.3, true, 0.1);
  const byMethod = isAdmin
    ? breakdown(SEED, [
        { key: "paystack", label: "Paystack" },
        { key: "bank_transfer", label: "Bank transfer" },
        { key: "at_centre", label: "Paid at centre" },
      ], 172000)
    : [];
  const refunds = { count: isAdmin ? 7 : null, amount: isAdmin ? 14000 : null, medianDaysToRefund: isAdmin ? 2.4 : null };
  const quoteValue = {
    series: isAdmin
      ? [series(SEED, "quoted", q.from, q.to, 210000, 0.35, false), series(SEED, "accepted", q.from, q.to, 130000, 0.35, false)]
      : [],
    acceptanceRate: isAdmin ? 0.58 : null,
  };
  const rng = rngFor(SEED + "ledger");
  const ledger = isAdmin
    ? Array.from({ length: 14 }).map((_, i) => ({
        date: addDays(q.to, -pickInt(rng, 0, daysInRange(q.from, q.to) - 1)),
        reference: `PAY-${8000 + i}`,
        receipt: `RCT-${5000 + i}`,
        idea: `IDEA-${300 + i}`,
        method: ["Paystack", "Bank transfer", "Paid at centre"][pickInt(rng, 0, 2)],
        amount: 2000,
        status: ["PAID", "PAID", "PAID", "AWAITING_CONFIRMATION", "FAILED"][pickInt(rng, 0, 4)],
        refundStatus: pickInt(rng, 0, 9) === 0 ? "REFUNDED" : "—",
      }))
    : [];
  return envelope(q, { cash, booked, series: { netFees }, byMethod, refunds, quotes: quoteValue, ledger }, [], {});
}

// ---------- Projects ----------
export function projectsData(q: Range) {
  const kpis = [
    kpi(SEED, "activeProjects2", "Active projects", 34, 0.1, "number", "none"),
    kpi(SEED, "delivered", "Delivered (in range)", 12, 0.25, "number", "up"),
    kpi(SEED, "onTimeRate2", "On-time delivery rate", 0.812, 0.08, "percent", "up"),
    kpi(SEED, "cycleTime", "Median cycle time", 26, 0.2, "number", "down"),
    kpi(SEED, "overdueNow", "Overdue now", 5, 0.3, "number", "down"),
    kpi(SEED, "avgRating", "Avg. client rating", 4.6, 0.05, "number", "up"),
  ];
  const byStage = breakdown(SEED, [
    { key: "approved", label: "Approved" },
    { key: "design", label: "Design" },
    { key: "development", label: "Development" },
    { key: "testing", label: "Testing" },
    { key: "deployment", label: "Deployment" },
    { key: "on_hold", label: "On hold" },
  ], 34);
  const timeInStage = breakdown(SEED, [
    { key: "approved", label: "Approved" },
    { key: "design", label: "Design" },
    { key: "development", label: "Development" },
    { key: "testing", label: "Testing" },
    { key: "deployment", label: "Deployment" },
  ], 60);
  const rng = rngFor(SEED + "delivery");
  const deliveryVsTarget = Array.from({ length: 10 }).map((_, i) => ({
    code: `PRJ-${500 + i}`,
    title: ["Bakery POS", "Clinic booking", "School portal", "Logistics tracker", "Salon CRM", "Church media site", "Fintech onboarding", "Estate management", "Farm inventory", "Event ticketing"][i],
    daysEarlyLate: pickInt(rng, -9, 6),
  }));
  const updateFrequency = breakdown(SEED, [
    { key: "0", label: "0 updates" },
    { key: "1-2", label: "1–2 updates" },
    { key: "3-5", label: "3–5 updates" },
    { key: "6+", label: "6+ updates" },
  ], 34);
  const table = Array.from({ length: 12 }).map((_, i) => ({
    project: `PRJ-${500 + i}`,
    lead: ["Musa Ibrahim", "Chinedu Okafor", "Fatima Sani", "Grace Adeyemi"][pickInt(rng, 0, 3)],
    stage: ["Design", "Development", "Testing", "Deployment"][pickInt(rng, 0, 3)],
    progress: pickInt(rng, 20, 95),
    targetDate: addDays(q.to, pickInt(rng, -10, 25)),
    daysOverdue: pickInt(rng, 0, 8),
    lastClientUpdate: addDays(q.to, -pickInt(rng, 0, 12)),
    rating: pickInt(rng, 35, 50) / 10,
  }));
  return envelope(q, { kpis, byStage, timeInStage, deliveryVsTarget, updateFrequency, table }, [], {});
}

// ---------- Pipeline ----------
export function pipelineData(q: Range) {
  const kpis = [
    kpi(SEED, "ideasSubmitted2", "Ideas submitted", 86, 0.2, "number", "up"),
    kpi(SEED, "draftsStarted", "Drafts started", 142, 0.2, "number", "up"),
    kpi(SEED, "draftCompletion", "Draft completion rate", 0.605, 0.1, "percent", "up"),
    kpi(SEED, "timeToFirstQuote", "Median time to first quote", 2.1 * 86400, 0.25, "duration", "down"),
    kpi(SEED, "quoteAcceptance", "Quote acceptance rate", 0.58, 0.12, "percent", "up"),
    kpi(SEED, "walkInShare", "Walk-in share", 0.22, 0.2, "percent", "none"),
  ];
  const submittedOnline = series(SEED, "submittedOnline", q.from, q.to, 2.4, 0.4, false, 0.1);
  const submittedWalkIn = series(SEED, "submittedWalkIn", q.from, q.to, 0.7, 0.5, false, 0.05);
  const byCategory = breakdown(SEED, [
    { key: "web-dev", label: "Web development" },
    { key: "mobile-app", label: "Mobile app" },
    { key: "data", label: "Data & analytics" },
    { key: "design", label: "Design" },
    { key: "other", label: "Other" },
  ], 86);
  const ageing = breakdown(SEED, [
    { key: "0-2", label: "0–2 days" },
    { key: "3-7", label: "3–7 days" },
    { key: "8-14", label: "8–14 days" },
    { key: "15+", label: "15+ days" },
  ], 28);
  const rng = rngFor(SEED + "pipelineTable");
  const table = Array.from({ length: 12 }).map((_, i) => ({
    ref: `IDEA-${300 + i}`,
    title: ["POS for a bakery", "Clinic booking app", "School fees portal", "Logistics tracker", "Salon CRM", "Church streaming site", "Fintech KYC flow", "Estate management tool", "Farm inventory app", "Event ticketing site", "Tutoring marketplace", "Laundry booking app"][i],
    category: ["Web development", "Mobile app", "Data & analytics", "Design"][pickInt(rng, 0, 3)],
    source: ["Online", "Walk-in"][pickInt(rng, 0, 1)],
    submitted: addDays(q.to, -pickInt(rng, 0, 20)),
    feeStatus: ["PAID", "PAID", "AWAITING_CONFIRMATION"][pickInt(rng, 0, 2)],
    stage: ["Submitted", "Reviewed", "Quoted", "Accepted"][pickInt(rng, 0, 3)],
    daysWaiting: pickInt(rng, 0, 18),
  }));
  return envelope(q, { kpis, series: { submitted: { online: submittedOnline, walkIn: submittedWalkIn } }, by: { category: byCategory }, ageing, table }, [], {});
}

// ---------- Clients ----------
export function clientsData(q: Range) {
  const kpis = [
    kpi(SEED, "newClients", "New clients", 22, 0.25, "number", "up"),
    kpi(SEED, "activeClients", "Active clients", 118, 0.15, "number", "up"),
    kpi(SEED, "portalSignIns", "Portal sign-ins", 340, 0.2, "number", "up"),
    kpi(SEED, "returningRate", "Returning-client rate", 0.64, 0.1, "percent", "up"),
    kpi(SEED, "clientMessages", "Messages from clients", 210, 0.2, "number", "none"),
    kpi(SEED, "medianReply", "Median team reply time", 3.2 * 3600, 0.3, "duration", "down"),
  ];
  const signIns = series(SEED, "signIns", q.from, q.to, 11, 0.35, true, 0.1);
  const engagement = breakdown(SEED, [
    { key: "milestones", label: "Milestone approvals" },
    { key: "changes", label: "Change requests raised" },
    { key: "files", label: "Files uploaded" },
    { key: "courses", label: "Course requests" },
    { key: "ratings", label: "Ratings given" },
  ], 160);
  const optOuts = { digest: 0.14, promos: 0.27 };
  const byLocation = breakdown(SEED, [
    { key: "Kaduna", label: "Kaduna" },
    { key: "Lagos", label: "Lagos" },
    { key: "Abuja (FCT)", label: "Abuja (FCT)" },
    { key: "Kano", label: "Kano" },
    { key: "Other", label: "Other" },
  ], 118);
  return envelope(q, { kpis, series: { signIns }, engagement, optOuts, byLocation }, [], {});
}

// ---------- Courses ----------
export function coursesData(q: Range) {
  const kpis = [
    kpi(SEED, "courseViews", "Course views", 2400, 0.2, "number", "up"),
    kpi(SEED, "courseClicks2", "Clicks", 420, 0.2, "number", "up"),
    kpi(SEED, "enquiries", "Enquiries", 96, 0.25, "number", "up"),
    kpi(SEED, "enrolled", "Enrolled", 31, 0.3, "number", "up"),
    kpi(SEED, "viewToEnrol", "View-to-enrol rate", 0.0129, 0.2, "percent", "up"),
    kpi(SEED, "estCourseRev2", "Estimated course revenue", 890000, 0.2, "currency", "up", "estimate"),
  ];
  const rng = rngFor(SEED + "courseFunnel");
  const courseNames = ["Full-Stack Web Development", "Data Analytics with Power BI", "Python Programming", "UI/UX Design", "Digital Marketing"];
  const byCourse = courseNames.map((name) => {
    const views = pickInt(rng, 280, 820);
    const clicks = Math.round(views * pickFloat(rng, 0.12, 0.28));
    const enquiries = Math.round(clicks * pickFloat(rng, 0.2, 0.4));
    const contacted = Math.round(enquiries * pickFloat(rng, 0.6, 0.9));
    const enrolled = Math.round(contacted * pickFloat(rng, 0.25, 0.55));
    return { course: name, views, clicks, enquiries, contacted, enrolled, conversion: enrolled / views };
  });
  const leadSources = breakdown(SEED, [
    { key: "portal", label: "Portal" },
    { key: "website", label: "Website" },
    { key: "invite", label: "Invite" },
  ], 96);
  const counsellors = ["Blessing Nwosu", "Yusuf Abdullahi", "Chioma Eze"].map((name) => ({
    name,
    leads: pickInt(rng, 18, 40),
    medianTimeToContact: pickInt(rng, 2, 20) * 3600,
    enrolmentRate: pickFloat(rng, 0.2, 0.45),
  }));
  return envelope(q, { kpis, byCourse, leadSources, counsellors }, [], {});
}

// ---------- Team (admin only) ----------
export function teamData(q: Range, isAdmin: boolean) {
  const kpis = [
    kpi(SEED, "updatesPosted", "Updates posted", 96, 0.2, "number", "none", null, !isAdmin),
    kpi(SEED, "approvalTime", "Median approval time", 3.4 * 3600, 0.3, "duration", "down", null, !isAdmin),
    kpi(SEED, "clientReplyTime", "Median client-reply time", 3.2 * 3600, 0.3, "duration", "down", null, !isAdmin),
    kpi(SEED, "quotesSent", "Quotes sent", 54, 0.25, "number", "none", null, !isAdmin),
    kpi(SEED, "paymentsConfirmed", "Payments confirmed", 71, 0.2, "number", "none", null, !isAdmin),
  ];
  const rng = rngFor(SEED + "team");
  const people = isAdmin
    ? ["Musa Ibrahim", "Chinedu Okafor", "Fatima Sani", "Grace Adeyemi", "Tunde Bakare"].map((name) => ({
        name,
        role: ["Lead", "Engineer", "Engineer", "Lead", "Engineer"][pickInt(rng, 0, 4)],
        projects: pickInt(rng, 2, 8),
        updates: pickInt(rng, 6, 24),
        internalNotes: pickInt(rng, 2, 15),
        replies: pickInt(rng, 8, 40),
        medianReplyTime: pickInt(rng, 1, 10) * 3600,
        approvalsGiven: pickInt(rng, 0, 12),
      }))
    : [];
  const workload = isAdmin
    ? breakdown(SEED, [
        { key: "musa", label: "Musa Ibrahim" },
        { key: "chinedu", label: "Chinedu Okafor" },
        { key: "fatima", label: "Fatima Sani" },
        { key: "grace", label: "Grace Adeyemi" },
        { key: "tunde", label: "Tunde Bakare" },
      ], 34)
    : [];
  return envelope(q, { kpis, people, workload }, [], {});
}

// ---------- Operations ----------
export function operationsData(q: Range) {
  const emailSent = series(SEED, "emailSent", q.from, q.to, 96, 0.2, false);
  const emailFailed = series(SEED, "emailFailed", q.from, q.to, 4, 0.5, false);
  const smsSent = series(SEED, "smsSent", q.from, q.to, 40, 0.25, false);
  const smsFailed = series(SEED, "smsFailed", q.from, q.to, 2, 0.6, false);
  const topFailureReasons = breakdown(SEED, [
    { key: "invalid_number", label: "Invalid number" },
    { key: "provider_timeout", label: "Provider timeout" },
    { key: "bounced", label: "Bounced address" },
  ], 18);
  const payments = {
    attempts: 210,
    successRate: 0.88,
    abandoned: 14,
    medianConfirmHours: 3.6,
  };
  const security = {
    staffSignIns: 64,
    failedSignIns: 5,
    passwordResets: 2,
    codesRequested: 340,
    codesVerified: 318,
    rateLimitHits: 3,
  };
  const rng = rngFor(SEED + "apiHealth");
  const apiErrorsSeries = series(SEED, "apiErrors", q.from, q.to, 1.4, 0.6, false);
  const slowest = ["/api/analytics/revenue", "/api/analytics/projects", "/api/track", "/api/analytics/traffic/breakdown"].map((route) => ({
    route,
    p95: pickInt(rng, 180, 950),
  }));
  return envelope(
    q,
    {
      messaging: { series: { emailSent, emailFailed, smsSent, smsFailed }, failureRate: 0.041, topFailureReasons },
      payments,
      security,
      api: { errors: apiErrorsSeries, slowest },
    },
    [],
    {}
  );
}

// ---------- Realtime ----------
export function realtimeData() {
  const rng = rngFor(SEED + "realtime" + Math.floor(Date.now() / 15000));
  const activeVisitors = pickInt(rng, 8, 62);
  const perMinute = Array.from({ length: 30 }).map((_, i) => ({
    t: `${i}`,
    value: pickInt(rng, 0, 6),
  }));
  const topPages = breakdown(SEED + Math.floor(Date.now() / 15000), DIMENSION_ROWS.page, activeVisitors * 3);
  const topSourcesRT = breakdown(SEED + Math.floor(Date.now() / 15000) + "s", DIMENSION_ROWS.source.slice(0, 4), activeVisitors * 2);
  const devices = breakdown(SEED + Math.floor(Date.now() / 15000) + "d", DIMENSION_ROWS.device, activeVisitors);
  const eventsCatalogue = ["page_view", "cta_click", "tracker_search", "idea_form", "course_view", "scroll_depth"];
  const pages = ["/", "/apply", "/courses", "/track", "/about"];
  const sourcesRT = ["google", "direct", "instagram", "whatsapp", "facebook"];
  const devicesRT = ["mobile", "desktop", "tablet"];
  const feed = Array.from({ length: 50 }).map((_, i) => {
    const r = rngFor(SEED + "feed" + i + Math.floor(Date.now() / 15000));
    return {
      time: pickInt(r, 1, 300),
      event: eventsCatalogue[pickInt(r, 0, eventsCatalogue.length - 1)],
      path: pages[pickInt(r, 0, pages.length - 1)],
      source: sourcesRT[pickInt(r, 0, sourcesRT.length - 1)],
      device: devicesRT[pickInt(r, 0, devicesRT.length - 1)],
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    data: { activeVisitors, perMinute, topPages, topSources: topSourcesRT, devices, feed },
  };
}
