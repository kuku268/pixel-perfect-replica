"use client";

import { useT, type Key } from "@/lib/i18n";

// Tiny client leaf so a Server Component (app/upload/page.tsx) can drop a
// translated string into its own markup without becoming a client component.
export function PageStrings({ k }: { k: Key }) {
  const t = useT();
  return <>{t(k)}</>;
}
