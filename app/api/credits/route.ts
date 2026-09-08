import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Read the signed-in user's balance. Used by the header badge and the
// post-checkout success page; RLS limits the read to the caller's own row.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_balance")
    .eq("id", user.id)
    .single();

  return NextResponse.json(
    { balance: Number(profile?.credits_balance ?? 0) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
