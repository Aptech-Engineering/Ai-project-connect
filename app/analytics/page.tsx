import { Suspense } from "react";
import { AnalyticsApp } from "./AnalyticsApp";

export const metadata = { title: "Analytics · AI Project Connect" };

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-mist" />}>
      <AnalyticsApp />
    </Suspense>
  );
}
