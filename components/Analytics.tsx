"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { startTracking, trackPageView } from "@/lib/track";

/** Starts first-party tracking and records a page view on every route or `?view=` change. */
export default function Analytics() {
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search?.toString() ?? "";

  useEffect(() => {
    startTracking();
  }, []);

  useEffect(() => {
    trackPageView();
  }, [pathname, query]);

  return null;
}
