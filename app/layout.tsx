import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Analytics · AI Project Connect",
  description: "Read-only analytics dashboard for AI Project Connect (Aptech).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Poppins for display/headings/tile values, Lato for everything else — per spec 11.1 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Lato:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
