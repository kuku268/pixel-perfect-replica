import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Server-only helpers for ECPay (綠界) AIO checkout.
//
// ECPAY_ENV=stage (default) uses ECPay's public test merchant 3002607 unless
// ECPAY_MERCHANT_ID / ECPAY_HASH_KEY / ECPAY_HASH_IV are set. Those three test
// values are published in ECPay's docs and are not secrets. ECPAY_ENV=prod
// refuses to start without real credentials.

const STAGE = {
  merchantId: "3002607",
  hashKey: "pwFHCqoQZGmho4w6",
  hashIV: "EkRm7iFT261dpevs",
};

export type EcpayConfig = {
  env: "stage" | "prod";
  merchantId: string;
  hashKey: string;
  hashIV: string;
  checkoutUrl: string;
};

export function ecpayConfig(): EcpayConfig {
  const env = process.env.ECPAY_ENV === "prod" ? "prod" : "stage";
  const merchantId = process.env.ECPAY_MERCHANT_ID || (env === "stage" ? STAGE.merchantId : "");
  const hashKey = process.env.ECPAY_HASH_KEY || (env === "stage" ? STAGE.hashKey : "");
  const hashIV = process.env.ECPAY_HASH_IV || (env === "stage" ? STAGE.hashIV : "");
  if (!merchantId || !hashKey || !hashIV) {
    throw new Error("ECPAY_ENV=prod requires ECPAY_MERCHANT_ID, ECPAY_HASH_KEY and ECPAY_HASH_IV");
  }
  return {
    env,
    merchantId,
    hashKey,
    hashIV,
    checkoutUrl:
      env === "prod"
        ? "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"
        : "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
  };
}

// .NET HttpUtility.UrlEncode semantics, which is what ECPay hashes against:
// space -> "+", and only A-Z a-z 0-9 - _ . ! * ( ) left unescaped.
// encodeURIComponent additionally leaves ~ and ' alone, so escape those two.
function dotnetUrlEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/%20/g, "+")
    .replace(/~/g, "%7e")
    .replace(/'/g, "%27");
}

export function checkMacValue(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string,
): string {
  const body = Object.keys(params)
    .filter((k) => k !== "CheckMacValue")
    .sort((a, b) => {
      const x = a.toLowerCase();
      const y = b.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    })
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const raw = `HashKey=${hashKey}&${body}&HashIV=${hashIV}`;
  const encoded = dotnetUrlEncode(raw).toLowerCase();
  return createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

export function verifyCheckMacValue(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string,
): boolean {
  const given = (params.CheckMacValue ?? "").toUpperCase();
  const expected = checkMacValue(params, hashKey, hashIV);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// MerchantTradeNo: <= 20 chars, [A-Za-z0-9], unique per merchant forever.
export function newMerchantTradeNo(): string {
  const time = Date.now().toString(36).toUpperCase(); // 8 chars until ~2059
  const rand = randomBytes(5).toString("hex").toUpperCase().slice(0, 7);
  return `VSR${time}${rand}`; // 18 chars
}

// "yyyy/MM/dd HH:mm:ss" in Taiwan time, as ECPay requires.
export function merchantTradeDate(d = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
