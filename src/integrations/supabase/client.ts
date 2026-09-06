// Back-compat shim: M0 code imports the browser client from here. The real
// implementation now lives in @/lib/supabase/client (cookie-backed, lazy).
export { getSupabaseBrowserClient } from "@/lib/supabase/client";
