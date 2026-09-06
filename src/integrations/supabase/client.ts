// Back-compat shim: M0 code imports `supabase` from here. The real browser
// client now lives in @/lib/supabase/client (cookie-backed, @supabase/ssr).
export { supabase } from "@/lib/supabase/client";
