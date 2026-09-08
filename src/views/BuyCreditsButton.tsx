"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

// One shared "which tier is in flight" flag would need lifting state up; a
// module-level lock is enough to stop a double-click opening two Checkouts.
let inFlight = false;

export function BuyCreditsButton({ productId, label }: { productId: string; label: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    if (inFlight) return;
    inFlight = true;
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId }),
      });
      const body = (await response.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;

      if (!response.ok || !body?.url) {
        setError(body?.error ?? `Checkout failed (${response.status})`);
        return;
      }
      window.location.href = body.url;
    } catch {
      setError("Network error — please try again.");
    } finally {
      inFlight = false;
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button className="w-full" onClick={buy} disabled={pending}>
        {pending ? "Opening checkout…" : label}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
