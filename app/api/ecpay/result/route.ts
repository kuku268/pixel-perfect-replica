import { NextResponse } from "next/server";

// ECPay sends the shopper's browser back here with a form POST ("OrderResultURL").
// It carries no auth cookie (cross-site POST) and credits nothing — the notify
// route does that. Just bounce to a GET page with a 303.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const ok = form?.get("RtnCode") === "1";
  const target = ok ? "/credits/success?provider=ecpay" : "/credits?payment=failed";
  return NextResponse.redirect(new URL(target, request.url), 303);
}
