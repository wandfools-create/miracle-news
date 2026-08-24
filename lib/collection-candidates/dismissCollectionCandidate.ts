import "server-only";

import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

const DISMISSABLE = [
  "pending",
  "shortlisted",
  "enrich_failed",
  "enriching",
  "selected",
] as const;

export async function dismissCollectionCandidate(input: {
  candidateId: string;
  dismissedBy?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const candidateId = input.candidateId.trim();
  if (!candidateId) {
    return { ok: false, error: "후보 ID가 없습니다." };
  }

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error };
  }

  const { client } = createServiceRoleSupabaseClient();
  const { data, error } = await client
    .from("collection_candidates")
    .update({
      status: "dismissed",
      dismissed_at: new Date().toISOString(),
      dismissed_by: input.dismissedBy?.trim() || null,
    })
    .eq("id", candidateId)
    .in("status", [...DISMISSABLE])
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "이 후보는 제외할 수 없는 상태입니다." };
  }

  return { ok: true };
}
