import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe → us. No user cookie on this request, so everything below runs with
// the admin (service-role) client. The route is excluded from middleware.ts's
// matcher — auth.getUser() must never touch this path.
//
// Ordering matters: verify the signature BEFORE any 200, and treat a
// unique_violation on stripe_payment_intent_id as "already processed" so a
// Stripe retry never double-credits.
export async function POST(request: Request) {
  // RAW body. Parsing JSON first would change the bytes the signature covers.
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new NextResponse("missing stripe-signature", { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return new NextResponse("webhook not configured", { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    console.error("webhook signature verification failed", err);
    return new NextResponse("invalid signature", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true, unpaid: true });
  }

  const userId = session.metadata?.user_id;
  const productId = session.metadata?.product_id;
  const credits = Number(session.metadata?.credits);
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!userId || !productId || !Number.isFinite(credits) || credits <= 0 || !paymentIntentId) {
    console.error("checkout.session.completed missing metadata", {
      userId,
      productId,
      credits,
      paymentIntentId,
    });
    return new NextResponse("missing metadata", { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Ledger first — it is the source of truth. The partial UNIQUE INDEX on
  //    stripe_payment_intent_id turns a redelivery into a 23505.
  const { error: insertError } = await admin.from("credit_transactions").insert({
    user_id: userId,
    amount: credits,
    type: "purchase",
    description: `Purchased ${credits} credits`,
    stripe_payment_intent_id: paymentIntentId,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("credit_transactions insert failed", insertError);
    return new NextResponse("db insert failed", { status: 500 });
  }

  // 2. Balance is derived from the ledger. Read-then-write is fine for M2's
  //    single-webhook-per-purchase volume; if this write ever fails the fix is
  //    UPDATE profiles SET credits_balance = (SELECT sum(amount) ...).
  const { data: profile, error: readError } = await admin
    .from("profiles")
    .select("credits_balance")
    .eq("id", userId)
    .single();

  if (readError || !profile) {
    console.error("profile read failed", readError);
    return new NextResponse("profile read failed", { status: 500 });
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ credits_balance: Number(profile.credits_balance) + credits })
    .eq("id", userId);

  if (updateError) {
    console.error("balance update failed", updateError);
    return new NextResponse("balance update failed", { status: 500 });
  }

  return NextResponse.json({ received: true, credited: credits });
}
