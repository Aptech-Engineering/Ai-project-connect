import type { Metadata } from "next";
import { Suspense } from "react";
import QuotePage from "@/components/QuotePage";

export const metadata: Metadata = {
  title: "Your proposal — AI Project Connect",
  robots: { index: false },
};

export default function Page() {
  return (
    <Suspense>
      <QuotePage />
    </Suspense>
  );
}
