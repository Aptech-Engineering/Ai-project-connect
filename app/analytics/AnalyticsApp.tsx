"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { GlobalControls } from "@/components/GlobalControls";
import { ScreenHeader, Footer } from "@/components/ScreenHeader";
import { DefinitionsDrawer } from "@/components/DefinitionsDrawer";
import { getSession, setRole } from "@/lib/mock/session";
import { parseGlobalQuery, buildQueryString } from "@/lib/urlState";
import { SCREEN_TAGLINES, SCREENS } from "@/lib/screens";
import type { MeResponse, ScreenKey } from "@/lib/types";

import { OverviewScreen } from "@/components/screens/OverviewScreen";
import { TrafficScreen } from "@/components/screens/TrafficScreen";
import { EngagementScreen } from "@/components/screens/EngagementScreen";
import { FunnelsScreen } from "@/components/screens/FunnelsScreen";
import { RevenueScreen } from "@/components/screens/RevenueScreen";
import { ProjectsScreen } from "@/components/screens/ProjectsScreen";
import { PipelineScreen } from "@/components/screens/PipelineScreen";
import { ClientsScreen } from "@/components/screens/ClientsScreen";
import { CoursesScreen } from "@/components/screens/CoursesScreen";
import { TeamScreen } from "@/components/screens/TeamScreen";
import { OperationsScreen } from "@/components/screens/OperationsScreen";
import { RealtimeScreen } from "@/components/screens/RealtimeScreen";

export function AnalyticsApp() {
  const searchParams = useSearchParams();
  const [session, setSession] = useState<MeResponse | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setSession(getSession());
  }, []);

  const query = useMemo(() => parseGlobalQuery(searchParams), [searchParams]);

  function queryString(view: ScreenKey) {
    return buildQueryString({ view }, searchParams);
  }

  if (!session) {
    return <div className="min-h-screen bg-mist" />;
  }

  if (!session.canViewAnalytics) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-950 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-soft">
          <p className="font-display text-base font-semibold text-navy">No analytics access</p>
          <p className="mt-1 text-sm text-muted">Your account doesn&rsquo;t have access to Analytics. Ask an admin to turn it on.</p>
        </div>
      </div>
    );
  }

  const isAdmin = session.user.role === "admin";
  const requestedView = query.view;
  const screenDef = SCREENS.find((s) => s.key === requestedView);
  const blocked = screenDef?.adminOnly && !isAdmin;

  const definitionsByScreen: Record<string, Record<string, string>> = {
    overview: { Visitors: "Distinct visitor ids with at least one event in the range.", "On-time delivery rate": "Delivered in range with delivered_at ≤ target_date, ÷ delivered in range." },
    traffic: {
      Visitors: "Distinct visitor_id with at least one event.",
      Sessions: "Distinct session_id. A session ends after 30 minutes without activity, or at midnight Lagos time.",
      "Bounce rate": "Sessions with exactly one page view and no other interaction event, ÷ sessions.",
    },
    revenue: {
      "Net fee revenue": "Fees collected minus refunded, each counted by its own date.",
      "Booked value": "Money agreed (accepted quotes, approved changes) but not collected through the platform.",
    },
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar active={query.view} session={session} queryString={queryString} />
      <div className="flex min-h-screen flex-1 flex-col">
        <MobileNav active={query.view} session={session} queryString={queryString} />
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-white/90 px-4 py-3 backdrop-blur lg:px-6">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>Role:</span>
            <div className="flex overflow-hidden rounded-full border border-line">
              <button
                onClick={() => {
                  setRole("admin");
                  setSession(getSession());
                }}
                className={`focus-ring px-2.5 py-1 ${isAdmin ? "bg-navy text-white" : "text-muted"}`}
              >
                Admin
              </button>
              <button
                onClick={() => {
                  setRole("staff");
                  setSession(getSession());
                }}
                className={`focus-ring px-2.5 py-1 ${!isAdmin ? "bg-navy text-white" : "text-muted"}`}
              >
                Staff
              </button>
            </div>
          </div>
          <GlobalControls query={query} />
        </header>

        <main className="flex-1 px-4 py-5 lg:px-6">
          <ScreenHeader
            title={screenDef?.label ?? "Overview"}
            tagline={SCREEN_TAGLINES[query.view]}
            filters={
              query.source
                ? [{ label: "Source", value: query.source, onClear: () => {} }]
                : undefined
            }
          />

          {blocked ? (
            <div className="rounded-2xl border border-line bg-white p-8 text-center shadow-soft">
              <p className="font-display text-base font-semibold text-navy">{screenDef?.label} is admin-only</p>
              <p className="mt-1 text-sm text-muted">This section is hidden for staff without admin access.</p>
            </div>
          ) : (
            <ScreenSwitch view={query.view} query={query} isAdmin={isAdmin} />
          )}

          {query.view !== "realtime" && <Footer definitionsHref={() => setDrawerOpen(true)} />}
        </main>
      </div>

      <DefinitionsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        definitions={definitionsByScreen[query.view] ?? {}}
      />
    </div>
  );
}

function ScreenSwitch({ view, query, isAdmin }: { view: ScreenKey; query: ReturnType<typeof parseGlobalQuery>; isAdmin: boolean }) {
  switch (view) {
    case "overview":
      return <OverviewScreen query={query} />;
    case "traffic":
      return <TrafficScreen query={query} />;
    case "engagement":
      return <EngagementScreen query={query} />;
    case "funnels":
      return <FunnelsScreen query={query} />;
    case "revenue":
      return <RevenueScreen query={query} isAdmin={isAdmin} />;
    case "projects":
      return <ProjectsScreen query={query} />;
    case "pipeline":
      return <PipelineScreen query={query} />;
    case "clients":
      return <ClientsScreen query={query} />;
    case "courses":
      return <CoursesScreen query={query} />;
    case "team":
      return <TeamScreen query={query} isAdmin={isAdmin} />;
    case "operations":
      return <OperationsScreen query={query} />;
    case "realtime":
      return <RealtimeScreen />;
    default:
      return <OverviewScreen query={query} />;
  }
}
