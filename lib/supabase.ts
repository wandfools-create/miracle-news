import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";

const { url, key } = getSupabaseEnv();

/** Server/data access client (existing admin queries). Auth uses @/lib/supabase/client. */
export const supabase = createClient(url, key);