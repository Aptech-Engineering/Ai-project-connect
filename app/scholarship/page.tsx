import type { Metadata } from "next";
import { ScholarshipPage } from "@/components/scholarship/ScholarshipPage";

export const metadata: Metadata = {
  title: "Nigeria Independence Day Scholarship Programme — AI Project Connect",
  description:
    "Pay the scholarship form fee, sit the entrance exam at our Kaduna centre, and study a short-term tech course 100% tuition free with APTECH Computer Education and AI Projects LTD.",
};

export default function Page() {
  return <ScholarshipPage />;
}
