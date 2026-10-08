import type { Metadata, Viewport } from "next";
import { StudentPage } from "@/components/student/StudentPage";

export const metadata: Metadata = {
  title: "Student Pass — AI Project Connect",
  description: "Your student pass: fees, payments and whether you are cleared to enter the centre.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Student Pass", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#06142a",
};

export default function Page() {
  return <StudentPage />;
}
