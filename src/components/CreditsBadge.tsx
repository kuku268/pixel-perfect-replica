"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Two modes:
//  - `balance` given (server pages: /upload, /credits) — the value comes from the
//    server component, so every router.refresh() delivers the fresh number. No
//    client fetch, and it moves in lockstep with the job status column.
//  - `balance` omitted (client-only pages: dashboard) — fetch once on mount and
//    again whenever the tab regains focus.
export function CreditsBadge({ balance }: { balance?: number }) {
  const serverDriven = balance !== undefined;
  const [fetched, setFetched] = useState<number | null>(null);

  useEffect(() => {
    if (serverDriven) return;
    let cancelled = false;

    const load = () => {
      fetch("/api/credits", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { balance?: number } | null) => {
          if (!cancelled && typeof body?.balance === "number") setFetched(body.balance);
        })
        .catch(() => {});
    };

    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [serverDriven]);

  const shown = serverDriven ? balance : fetched;

  return (
    <Link
      href="/credits"
      className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground shadow-sm hover:border-primary/50"
      title="1 credit = 1 minute of video"
    >
      <span className="text-muted-foreground">Credits</span>
      <span className="font-semibold tabular-nums text-primary transition-colors">
        {shown === null || shown === undefined ? "…" : Math.floor(shown)}
      </span>
      <span className="text-muted-foreground">· Buy more</span>
    </Link>
  );
}
