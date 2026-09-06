"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/integrations/supabase/types";

// Browser-side Supabase client. Unlike M0's localStorage-backed client, this one
// stores the session in cookies via @supabase/ssr — that is what lets middleware,
// Server Components and route handlers (e.g. /api/jobs) see the signed-in user.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  const missing = [
    ...(!SUPABASE_URL ? ["NEXT_PUBLIC_SUPABASE_URL"] : []),
    ...(!SUPABASE_PUBLISHABLE_KEY ? ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] : []),
  ];
  throw new Error(
    `Missing Supabase environment variable(s): ${missing.join(", ")}. Set them in .env.`,
  );
}

export const supabase = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
