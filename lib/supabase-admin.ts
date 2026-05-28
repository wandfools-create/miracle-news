import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";

let cached: SupabaseClient | null = null;

/** Service-role Supabase client (server-only). Validates env on first use. */
export function getSupabaseAdmin(): SupabaseClient {
  if (!cached) {
    cached = createServiceRoleSupabaseClient().client;
  }
  return cached;
}
