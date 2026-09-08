import { NextResponse } from "next/server";

import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

type CheckoutBody = { product_id?: unknown };

export async function POST(request: Request) {
  // 1. Caller must be signed in — user_id comes from the session, never the body.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CheckoutBody;
  const productId = typeof body.product_id === "string" ? body.product_id : "";
  if (!productId) {
    return NextResponse.json({ error: "product_id required" }, { status: 400 });
  }

  // 2. Tier must be active and linked to a Stripe price. RLS already limits
  //    this read to active rows, so an inactive id simply comes back empty.
  const { data: product } = await supabase
    .from("credit_products")
    .select("id, name, credits, stripe_price_id")
    .eq("id", productId)
    .eq("active", true)
    .maybeSingle();

  if (!product?.stripe_price_id) {
    return NextResponse.json({ error: "unknown or inactive product" }, { status: 400 });
  }

  // 3. Build return URLs from the request origin so the same code works on the
  //    *.vercel.app URL today and the custom domain in M3.
  const origin =
    request.headers.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    new URL(request.url).origin;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{ price: product.stripe_price_id, quantity: 1 }],
    success_url: `${origin}/credits/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/credits`,
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    // Stripe metadata values are strings. The webhook reads these three.
    metadata: {
      user_id: user.id,
      product_id: product.id,
      credits: String(product.credits),
    },
  });

  if (!session.url) {
    return NextResponse.json({ error: "stripe did not return a checkout url" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
