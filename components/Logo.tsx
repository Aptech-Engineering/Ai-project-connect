"use client";

import { cn } from "@/lib/format";
import { useSiteContent } from "@/lib/content";
import AptechMark from "./AptechMark";

/** `aptech` adds the APTECH mark beside ours — the two names the site trades under. */
export default function Logo({ className, dark = false, aptech = false }: { className?: string; dark?: boolean; aptech?: boolean }) {
  const { brand } = useSiteContent();
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="grid size-9 place-items-center rounded-[10px] bg-brand font-display text-[15px] font-bold text-white shadow-lg shadow-brand/30">
        AI
      </span>
      <span className={cn("font-display text-[17px] font-semibold tracking-tight", dark ? "text-navy" : "text-white")}>
        {brand.name}
      </span>
      {aptech && (
        <>
          <span className={cn("h-6 w-px", dark ? "bg-line" : "bg-white/20")} aria-hidden />
          <AptechMark height="h-7" />
        </>
      )}
    </span>
  );
}
