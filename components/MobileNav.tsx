"use client";

import { useState } from "react";
import Link from "next/link";
import { SCREENS } from "@/lib/screens";
import type { MeResponse, ScreenKey } from "@/lib/types";

export function MobileNav({
  active,
  session,
  queryString,
}: {
  active: ScreenKey;
  session: MeResponse;
  queryString: (view: ScreenKey) => string;
}) {
  const [open, setOpen] = useState(false);
  const visible = SCREENS.filter((s) => session.sections.includes(s.key));
  const activeLabel = visible.find((s) => s.key === active)?.label ?? "Overview";

  return (
    <div className="lg:hidden relative border-b border-line bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-navy"
      >
        <span className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-md bg-brand flex items-center justify-center text-[10px] font-display font-semibold text-white">
            AI
          </span>
          {activeLabel}
        </span>
        <span aria-hidden>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="max-h-[70vh] overflow-y-auto border-t border-line">
          {visible.map((s) => (
            <Link
              key={s.key}
              href={queryString(s.key)}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2.5 text-sm ${s.key === active ? "bg-mist font-medium text-navy" : "text-muted"}`}
            >
              {s.label}
              {s.adminOnly && <span className="ml-1 text-[10px]">🔒</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
