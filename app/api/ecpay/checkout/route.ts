import { NextResponse } from "next/server";

import { ecpayConfig, checkMacValue, merchantTradeDate, newMerchantTradeNo } from "@/lib/ecpay";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type CheckoutBody = { product_id?: unknown };

// Creates a pending ecpay_orders row and returns the signed form the browser
// must POST to ECPay (ECPay's AIO checkout is a form post, not a redirect URL).
export async function POST(request: Request) {
  // 1. Signed-in user only — user_id comes from the session, never the body.
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

  // 2. Tier must be active and have an NT$ price.
  const { data: product } = await supabase
    .from("credit_products")
    .select("id, credits, price_twd")
    .eq("id", productId)
    .eq("active", true)
    .maybeSingle();
  if (!product?.price_twd) {
    return NextResponse.json({ error: "unknown or inactive product" }, { status: 400 });
  }

  const cfg = ecpayConfig();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? request.headers.get("origin") ?? new URL(request.url).origin;

  // 3. Persist the order BEFORE sending the user away: the notify callback only
  //    echoes MerchantTradeNo back, and this row is what it credits against.
  const merchantTradeNo = newMerchantTradeNo();
  const credits = Number(product.credits);
  const admin = createAdminClient();
  const { error: insertError } = await admin.from("ecpay_orders").insert({
    merchant_trade_no: merchantTradeNo,
    user_id: user.id,
    product_id: product.id,
    credits,
    amount_twd: product.price_twd,
  });
  if (insertError) {
    console.error("ecpay_orders insert failed", insertError);
    return NextResponse.json({ error: "could not create order" }, { status: 500 });
  }

  // 4. Signed AIO form. Credit card only for now: ATM / convenience-store codes
  //    pay later and would need a "waiting for payment" state in the UI.
  const fields: Record<string, string> = {
    MerchantID: cfg.merchantId,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: merchantTradeDate(),
    PaymentType: "aio",
    TotalAmount: String(product.price_twd),
    TradeDesc: "Video Speed Reader credits",
    ItemName: `影片速讀點數 ${credits} 點`,
    ReturnURL: `${origin}/api/ecpay/notify`,
    OrderResultURL: `${origin}/api/ecpay/result`,
    ClientBackURL: `${origin}/credits`,
    ChoosePayment: "Credit",
    EncryptType: "1",
    CustomField1: user.id,
  };
  fields.CheckMacValue = checkMacValue(fields, cfg.hashKey, cfg.hashIV);

  return NextResponse.json({ action: cfg.checkoutUrl, fields });
}
