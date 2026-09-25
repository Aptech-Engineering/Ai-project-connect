"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { StatusView } from "@/components/scholarship/StatusView";

/** The applicant's own page: /scholarship/status?ref=SCH-26-XXXXX&token=… */
function StatusFromUrl() {
  const params = useSearchParams();
  return <StatusView refCode={params.get("ref")} token={params.get("token")} payment={params.get("payment")} />;
}

export default function Page() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-mist" />}>
      <StatusFromUrl />
    </Suspense>
  );
}
