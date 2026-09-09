"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// While any job is still moving (pending / downloading / transcribe), re-fetch
// the server component every few seconds so the status column updates on its
// own. router.refresh() re-runs the page's server code without a full reload,
// so the upload form's local state (half-typed URL, chosen language) survives.
// The effect tears down as soon as every job reaches a terminal status.
export function JobsAutoRefresh({ active, intervalMs = 5000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    const tick = () => {
      // Skip refreshes while the tab is hidden; the focus handler catches up.
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, intervalMs);
    window.addEventListener("focus", tick);

    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [active, intervalMs, router]);

  if (!active) return null;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-primary" />
      Live · updating every {Math.round(intervalMs / 1000)}s
    </span>
  );
}
