"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

// Lazily-created browser client.
//
// It MUST NOT be constructed at module scope: "use client" modules are still
// evaluated on the server during prerendering, and building a browser client
// there blows up (`Cannot destructure property 'auth' of 'a'` while Next.js
// prerenders /_not-found). Every caller asks for it from inside an effect or
// an event handler, so first use always happens in the browser.
let client: SupabaseClient<Database> | undefined;

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    const missing = [
      ...(!url ? ["NEXT_PUBLIC_SUPABASE_URL"] : []),
      ...(!key ? ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    throw new Error(
      `Missing Supabase environment variable(s): ${missing.join(", ")}. Set them in .env.`,
    );
  }

  client = createBrowserClient<Database>(url, key);
  return client;
}
