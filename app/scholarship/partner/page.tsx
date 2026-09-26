import type { Metadata } from "next";
import { PartnerPage } from "@/components/scholarship/PartnerPage";

export const metadata: Metadata = {
  title: "Scholarship Programme — in partnership with AI Project Connect",
  description:
    "A co-branded scholarship page: short-term tech courses 100% tuition free with APTECH Computer Education and AI Projects LTD, run with our partner organisation.",
};

/**
 * One page serves every partner. The export is static, so the slug is read from
 * the path in the browser (/scholarship/partner/<slug>) — .htaccess rewrites any
 * slug to this file.
 */
export default function Page() {
  return <PartnerPage />;
}
