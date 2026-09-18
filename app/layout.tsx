import type { Metadata, Viewport } from "next";
import { Lato, Poppins } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import Analytics from "@/components/Analytics";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-lato",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Project Connect — We build your idea. You watch it grow.",
  description:
    "Track your Aptech build live with your Project ID: current stage, progress, updates and the tech stack behind your product.",
};

export const viewport: Viewport = {
  themeColor: "#0b1f3a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${lato.variable}`}>
      <body>
        {children}
        {/* Reads the URL, so it sits in its own Suspense boundary for the static export. */}
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
