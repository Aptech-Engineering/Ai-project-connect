import type { Metadata } from "next";
import ApplyPage from "@/components/ApplyPage";

export const metadata: Metadata = {
  title: "Your idea application — AI Project Connect",
  description: "Continue your idea application, pay the commitment fee and send it to our team.",
  robots: { index: false },
};

/**
 * Where an application lives.
 *
 * - `/apply` — the draft this browser remembers, or a new one.
 * - `/apply?resume=<token>` — the link the server emails ("Continue your application").
 * - `/apply?ref=IDEA-…&payment=success|pending|failed&reference=…` — Paystack's callback.
 *
 * Both query strings are read in the browser, because the site is a static export.
 */
export default function Page() {
  return <ApplyPage />;
}
