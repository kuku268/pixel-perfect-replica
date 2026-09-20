import { ecpayConfig, verifyCheckMacValue } from "@/lib/ecpay";
import { createAdminClient } from "@/lib/supabase/admin";

// ECPay → us, server to server (the AIO "ReturnURL"). This is the ONLY place
// that credits an ECPay purchase. Excluded from middleware.ts's matcher.
//
// Contract: reply with the plain text "1|OK" once the notification is handled
// (including "already handled" and "will never be credited"). Anything else
// makes ECPay retry, so only reply otherwise on transient failures (DB down).

const OK = () => new Response("1|OK", { headers: { "Content-Type": "text/plain" } });
const RETRY = (why: string) =>
  new Response(`0|${why}`, { status: 500, headers: { "Content-Type": "text/plain" } });

export async function POST(request: Request) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = typeof v === "string" ? v : "";

  const cfg = ecpayConfig();
  if (!verifyCheckMacValue(params, cfg.hashKey, cfg.hashIV)) {
    console.error("ecpay notify: bad CheckMacValue", params.MerchantTradeNo);
    return new Response("0|CheckMacValue error", { status: 400 });
  }
  if (params.MerchantID !== cfg.merchantId) {
    console.error("ecpay notify: wrong MerchantID", params.MerchantID);
    return new Response("0|MerchantID error", { status: 400 });
  }

  const tradeNo = params.MerchantTradeNo;
  const admin = createAdminClient();

  // Failed / cancelled payment: record it, never credit.
  if (params.RtnCode !== "1") {
    await admin
      .from("ecpay_orders")
      .update({ status: "failed", rtn_code: params.RtnCode ?? null, notify_payload: params })
      .eq("merchant_trade_no", tradeNo)
      .eq("status", "pending");
    return OK();
  }

  // "模擬付款" from the ECPay merchant back office. Useful in stage; in prod it
  // is not real money, so it must never credit.
  if (params.SimulatePaid === "1" && cfg.env === "prod") {
    console.warn("ecpay notify: ignoring SimulatePaid in prod", tradeNo);
    return OK();
  }

  const amount = Number.parseInt(params.TradeAmt ?? "", 10);
  const { data: result, error } = await admin.rpc("ecpay_mark_paid", {
    p_merchant_trade_no: tradeNo,
    p_ecpay_trade_no: params.TradeNo ?? "",
    p_amount: Number.isFinite(amount) ? amount : -1,
    p_payload: params,
  });

  if (error) {
    console.error("ecpay_mark_paid failed", tradeNo, error);
    return RETRY("db error");
  }
  if (result !== "credited" && result !== "duplicate") {
    console.error("ecpay notify: not credited", tradeNo, result);
  }
  return OK();
}
