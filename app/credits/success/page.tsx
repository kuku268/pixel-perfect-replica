import type { Metadata } from "next";

import { PurchaseSuccess } from "@/views/PurchaseSuccess";

export const metadata: Metadata = {
  title: "Payment received — Video Speed Reader",
  robots: { index: false, follow: false },
};

export default function CreditsSuccessPage() {
  return <PurchaseSuccess />;
}
