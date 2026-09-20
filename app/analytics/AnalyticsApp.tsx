"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Sidebar } from "@/components/analytics/Sidebar";
import { MobileNav } from "@/components/analytics/MobileNav";
import { GlobalControls } from "@/components/analytics/GlobalControls";
import { ScreenHeader, Footer } from "@/components/analytics/ScreenHeader";
import { DefinitionsDrawer } from "@/components/analytics/DefinitionsDrawer";
import { PanelsDrawer } from "@/components/analytics/PanelsDrawer";
import { useAnalyticsMe } from "@/lib/analytics/api";
import { signOut } from "@/lib/staff";
import { parseGlobalQuery, buildQueryString } from "@/lib/analytics/urlState";
import { SCREEN_TAGLINES, SCREENS } from "@/lib/analytics/screens";
import type { MeResponse, ScreenKey } from "@/lib/analytics/types";

import { OverviewScreen } from "@/components/analytics/screens/OverviewScreen";
import { TrafficScreen } from "@/components/analytics/screens/TrafficScreen";
import { EngagementScreen } from "@/components/analytics/screens/EngagementScreen";
import { FunnelsScreen } from "@/components/analytics/screens/FunnelsScreen";
import { RevenueScreen } from "@/components/analytics/screens/RevenueScreen";
import { ProjectsScreen } from "@/components/analytics/screens/ProjectsScreen";
import { PipelineScreen } from "@/components/analytics/screens/PipelineScreen";
import { ClientsScreen } from "@/components/analytics/screens/ClientsScreen";
import { CoursesScreen } from "@/components/analytics/screens/CoursesScreen";
import { TeamScreen } from "@/components/analytics/screens/TeamScreen";
import { OperationsScreen } from "@/components/analytics/screens/OperationsScreen";
import { RealtimeScreen } from "@/components/analytics/screens/RealtimeScreen";

export function AnalyticsApp() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { session, loading, error, refresh } = useAnalyticsMe();

  // Signed out (or the session expired): go to sign-in, keeping where we were.
  useEffect(() => {
    if (!loading && !session && error) router.replace("/analytics/sign-in");
  }, [loading, session, error, router]);

  const query = useMemo(() => parseGlobalQuery(searchParams), [searchParams]);
  const panel = searchParams.get("panel");
  const openPanel = panel === "views" || panel === "reports" ? panel : null;
  /** The query the dashboard is showing, which is what a saved view or report keeps. */
  const currentQuery = buildQueryString({}, searchParams).replace(/&?(panel|save)=[^&]*/g, "");

  function closePanel() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("panel");
    next.delete("save");
    router.replace(`/analytics?${next.toString()}`);
  }

  function queryString(view: ScreenKey) {
    return buildQueryString({ view }, searchParams);
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mist" aria-busy="true">
        <span className="sr-only">Loading Analytics…</span>
      </div>
    );
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
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
            <span className="truncate font-semibold text-navy">{session.user.name}</span>
            <span className="hidden capitalize sm:inline">· {session.user.role}</span>
            <Link href="/engineering" className="focus-ring hidden rounded-full border border-line px-2.5 py-1 hover:text-navy md:inline">
              Engineering Panel
            </Link>
            <button
              onClick={async () => {
                await signOut();
                await refresh();
                router.replace("/analytics/sign-in");
              }}
              className="focus-ring rounded-full border border-line px-2.5 py-1 hover:text-navy"
            >
              Sign out
            </button>
          </div>
          <GlobalControls query={query} />
        </header>

        <main className="flex-1 px-4 py-5 lg:px-6">
          <ScreenHeader
            title={screenDef?.label ?? "Overview"}
            tagline={SCREEN_TAGLINES[query.view]}
            onSave={() => router.replace(`/analytics${buildQueryString({}, searchParams)}&panel=views&save=1`)}
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

      {openPanel && (
        <PanelsDrawer
          panel={openPanel}
          onClose={closePanel}
          session={session}
          currentQuery={currentQuery}
          currentView={query.view}
          startSaving={searchParams.get("save") === "1"}
        />
      )}

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
