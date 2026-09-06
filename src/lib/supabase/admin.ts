import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

// Server-only Supabase client using the Secret (service-role) key.
//
// It bypasses RLS entirely, so every query made through it MUST re-impose the
// per-user filter by hand (e.g. .eq("user_id", user.id)). Never import this
// from a Client Component, and never expose SUPABASE_SECRET_KEY to the browser
// (no NEXT_PUBLIC_ prefix, never committed to this repo — it is public).
export function createAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    const missing = [
      ...(!url ? ["NEXT_PUBLIC_SUPABASE_URL"] : []),
      ...(!secretKey ? ["SUPABASE_SECRET_KEY"] : []),
    ];
    throw new Error(
      `Missing server environment variable(s): ${missing.join(", ")}. ` +
        "SUPABASE_SECRET_KEY must be set in the Vercel project settings — never in the committed .env.",
    );
  }

  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
