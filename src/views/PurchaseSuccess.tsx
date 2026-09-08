"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";

// The webhook is the only thing that credits. This page just waits for the
// balance to move so the redirect back from Stripe doesn't feel like nothing
// happened. If the webhook is slow, /credits will still be right later.
export function PurchaseSuccess() {
  const [balance, setBalance] = useState<number | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let attempts = 0;
    let first: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      attempts += 1;
      try {
        const r = await fetch("/api/credits", { cache: "no-store" });
        const body = (await r.json().catch(() => null)) as { balance?: number } | null;
        if (typeof body?.balance === "number") {
          setBalance(body.balance);
          if (first === null) first = body.balance;
          else if (body.balance > first) {
            setSettled(true);
            return;
          }
        }
      } catch {
        // keep polling
      }
      if (attempts < 10) timer = setTimeout(poll, 1500);
      else setSettled(true);
    }

    void poll();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-hero">
      <header className="border-b border-border/70 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <BrandMark to="/app" />
        </div>
      </header>
      <main className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-primary">
          Payment received
        </h1>
        <p className="mt-4 text-muted-foreground">
          {settled ? "Your credits are ready." : "Adding your credits…"}
        </p>
        <p className="mt-6 font-display text-5xl font-semibold tabular-nums text-primary">
          {balance === null ? "…" : Math.floor(balance)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">current balance</p>
        <div className="mt-10 flex justify-center gap-3">
          <Button asChild>
            <Link href="/upload">Transcribe a video</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/credits">View history</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
