import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/BrandMark";
import { CreditsBadge } from "@/components/CreditsBadge";
import { createClient } from "@/lib/supabase/server";
import { BuyCreditsButton } from "@/views/BuyCreditsButton";

export const metadata: Metadata = {
  title: "Credits — Video Speed Reader",
  description: "Your balance, credit packs, and transaction history.",
  robots: { index: false, follow: false },
};

// Balance changes out-of-band (webhook, worker), so never cache.
export const dynamic = "force-dynamic";

function usd(value: number) {
  return `$${value.toFixed(2)}`;
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// purchase -> primary (green), signup_bonus -> accent, deduction -> muted.
function typeClasses(type: string) {
  if (type === "purchase" || type === "admin_grant") return "bg-primary/12 text-primary";
  if (type === "signup_bonus") return "bg-accent text-accent-foreground";
  return "bg-muted text-muted-foreground";
}

export default async function CreditsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [{ data: profile }, { data: products }, { data: transactions }] = await Promise.all([
    supabase.from("profiles").select("credits_balance").eq("id", user.id).single(),
    supabase
      .from("credit_products")
      .select("id, name, credits, price_usd, stripe_price_id")
      .eq("active", true)
      .order("price_usd"),
    supabase
      .from("credit_transactions")
      .select("id, amount, type, description, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const balance = Number(profile?.credits_balance ?? 0);
  const tiers = (products ?? []).filter((p) => p.stripe_price_id);

  // Discount story: every tier's $/credit is compared to the smallest pack.
  const smallest = tiers.reduce<(typeof tiers)[number] | null>(
    (acc, p) => (acc === null || Number(p.credits) < Number(acc.credits) ? p : acc),
    null,
  );
  const baselineRatio = smallest ? Number(smallest.price_usd) / Number(smallest.credits) : null;

  return (
    <div className="min-h-screen bg-hero">
      <header className="border-b border-border/70 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <BrandMark to="/app" />
          <div className="flex items-center gap-4">
            <CreditsBadge balance={balance} />
            <Link href="/upload" className="text-sm font-medium text-primary hover:underline">
              Upload
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-14">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-primary">Credits</h1>

        {/* Balance */}
        <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-card">
          <p className="text-sm font-semibold tracking-tight text-foreground">Your balance</p>
          <p className="mt-2 font-display text-5xl font-semibold tabular-nums text-primary">
            {Math.floor(balance)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            1 credit = 1 minute of video. Rounded up per video; failed jobs are never charged.
          </p>
        </section>

        {/* Tiers */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Buy credits</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {tiers.map((tier) => {
              const credits = Number(tier.credits);
              const price = Number(tier.price_usd);
              const ratio = price / credits;
              const bonusPct =
                baselineRatio && ratio < baselineRatio
                  ? Math.round((1 - ratio / baselineRatio) * 100)
                  : 0;
              return (
                <div
                  key={tier.id}
                  className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-card"
                >
                  <div className="flex items-start justify-between">
                    <p className="text-lg font-semibold tracking-tight text-foreground">
                      {tier.name}
                    </p>
                    {bonusPct > 0 ? (
                      <span className="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-semibold text-primary">
                        +{bonusPct}%
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 font-display text-3xl font-semibold text-primary">{usd(price)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {usd(ratio)} per credit · {credits} minutes of video
                  </p>
                  <div className="mt-6">
                    <BuyCreditsButton productId={tier.id} label={`Buy ${credits} credits`} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Payments are processed by Stripe. Test mode: use card 4242 4242 4242 4242.
          </p>
        </section>

        {/* History */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-card">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">History</h2>
          {!transactions || transactions.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {transactions.map((tx) => {
                const amount = Number(tx.amount);
                return (
                  <li key={tx.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <div className="min-w-0">
                      <span
                        className={`mr-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeClasses(tx.type)}`}
                      >
                        {tx.type}
                      </span>
                      <span className="text-foreground">{tx.description ?? tx.type}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{when(tx.created_at)}</span>
                    </div>
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${amount < 0 ? "text-muted-foreground" : "text-primary"}`}
                    >
                      {amount > 0 ? `+${amount}` : amount}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
