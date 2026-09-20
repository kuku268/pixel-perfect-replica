import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { CreditsView } from "@/views/CreditsView";

export const metadata: Metadata = {
  title: "Credits — Video Speed Reader",
  description: "Your balance, credit packs, and transaction history.",
  robots: { index: false, follow: false },
};

// Balance changes out-of-band (webhook, worker), so never cache.
export const dynamic = "force-dynamic";

export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const { payment } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [{ data: profile }, { data: products }, { data: transactions }] = await Promise.all([
    supabase.from("profiles").select("credits_balance").eq("id", user.id).single(),
    supabase
      .from("credit_products")
      .select("id, credits, price_usd, price_twd, stripe_price_id")
      .eq("active", true)
      .order("price_usd"),
    supabase
      .from("credit_transactions")
      .select("id, amount, type, description, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <CreditsView
      balance={Number(profile?.credits_balance ?? 0)}
      tiers={(products ?? []).map((p) => ({
        id: p.id,
        credits: Number(p.credits),
        usd: p.stripe_price_id ? Number(p.price_usd) : null,
        twd: p.price_twd ? Number(p.price_twd) : null,
      }))}
      transactions={(transactions ?? []).map((tx) => ({
        id: tx.id,
        amount: Number(tx.amount),
        type: tx.type,
        description: tx.description,
        created_at: tx.created_at,
      }))}
      paymentFailed={payment === "failed"}
      stripeTest={(process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_")}
      ecpayTest={process.env.ECPAY_ENV !== "prod"}
    />
  );
}
