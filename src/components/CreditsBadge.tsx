"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Reads GET /api/credits on mount. Pass `initialBalance` from a server page to
// avoid the flash; client pages (the dashboard) just let it load.
export function CreditsBadge({ initialBalance }: { initialBalance?: number }) {
  const [balance, setBalance] = useState<number | null>(initialBalance ?? null);

  useEffect(() => {
    if (initialBalance !== undefined) return;
    let cancelled = false;
    fetch("/api/credits", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { balance?: number } | null) => {
        if (!cancelled && typeof body?.balance === "number") setBalance(body.balance);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialBalance]);

  return (
    <Link
      href="/credits"
      className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground shadow-sm hover:border-primary/50"
      title="1 credit = 1 minute of video"
    >
      <span className="text-muted-foreground">Credits</span>
      <span className="font-semibold tabular-nums text-primary">
        {balance === null ? "…" : Math.floor(balance)}
      </span>
      <span className="text-muted-foreground">· Buy more</span>
    </Link>
  );
}
