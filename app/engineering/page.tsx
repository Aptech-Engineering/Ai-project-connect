import type { Metadata } from "next";
import EngineeringApp from "@/components/engineering/EngineeringApp";

export const metadata: Metadata = {
  title: "Engineering Panel — AI Project Connect",
  description: "Manage assigned projects, publish updates and tag the tech stack.",
  robots: { index: false },
};

export default function EngineeringPage() {
  return <EngineeringApp />;
}
