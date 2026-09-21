"use client";

import Link from "next/link";
import { SCREENS } from "@/lib/analytics/screens";
import type { MeResponse, ScreenKey } from "@/lib/analytics/types";
import clsx from "clsx";

export function Sidebar({
  active,
  session,
  queryString,
}: {
  active: ScreenKey;
  session: MeResponse;
  queryString: (view: ScreenKey) => string;
}) {
  const visible = SCREENS.filter((s) => session.sections.includes(s.key));

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-60 shrink-0 bg-navy text-white h-screen self-start sticky top-0">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-navy-700">
        <div className="h-8 w-8 rounded-lg bg-brand flex items-center justify-center font-display font-semibold text-sm">
          AI
        </div>
        <div className="leading-tight">
          <div className="font-display text-sm font-semibold">Project Connect</div>
          <div className="text-[11px] text-navy-600 tracking-wide">ANALYTICS</div>
        </div>
      </div>

      <nav className="sidebar-scroll min-h-0 flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {visible.map((s) => {
          const isActive = s.key === active;
          return (
            <Link
              key={s.key}
              href={queryString(s.key)}
              className={clsx(
                "flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition-colors focus-ring",
                isActive ? "bg-navy-800 text-white" : "text-navy-600 hover:bg-navy-800 hover:text-white"
              )}
            >
              <span className="flex items-center gap-2">
                {isActive && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />}
                {s.label}
              </span>
              {s.live && (
                <span className="h-1.5 w-1.5 rounded-full bg-teal animate-pulse" aria-label="Live" />
              )}
              {s.adminOnly && !s.live && (
                <span className="text-[10px] text-navy-600">🔒</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-2 pb-2 space-y-0.5 border-t border-navy-700 pt-2">
        <Link href={queryString(active) + "&panel=views"} className="block rounded-xl px-3 py-2 text-sm text-navy-600 hover:bg-navy-800 hover:text-white focus-ring">
          Saved views
        </Link>
        <Link href={queryString(active) + "&panel=reports"} className="block rounded-xl px-3 py-2 text-sm text-navy-600 hover:bg-navy-800 hover:text-white focus-ring">
          Reports
        </Link>
      </div>

      <div className="px-4 py-4 border-t border-navy-700">
        <div className="text-xs text-white">{session.user.name}</div>
        <div className="text-[11px] text-navy-600 capitalize">{session.user.role} · analytics access</div>
      </div>
    </aside>
  );
}
