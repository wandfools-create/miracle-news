import "server-only";

import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

const SHORTLISTABLE = [
  "pending",
  "enrich_failed",
  "enriching",
  "selected",
] as const;

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

/** Move candidates into editorial shortlist. No OpenAI. */
export async function shortlistCollectionCandidates(input: {
  candidateIds: string[];
  shortlistedBy?: string | null;
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const ids = uniqueIds(input.candidateIds);
  if (ids.length === 0) {
    return { ok: false, error: "선택된 후보가 없습니다." };
  }

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return { ok: false, error: envCheck.error };

  const { client } = createServiceRoleSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("collection_candidates")
    .update({
      status: "shortlisted",
      selected_at: now,
      selected_by: input.shortlistedBy?.trim() || null,
      updated_at: now,
    })
    .in("id", ids)
    .in("status", [...SHORTLISTABLE])
    .is("article_id", null)
    .select("id");

  if (error) return { ok: false, error: error.message };
  return { ok: true, count: data?.length ?? 0 };
}

/** Return shortlisted candidates to pending. No OpenAI. */
export async function unshortlistCollectionCandidates(input: {
  candidateIds: string[];
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const ids = uniqueIds(input.candidateIds);
  if (ids.length === 0) {
    return { ok: false, error: "선택된 후보가 없습니다." };
  }

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return { ok: false, error: envCheck.error };

  const { client } = createServiceRoleSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("collection_candidates")
    .update({
      status: "pending",
      updated_at: now,
    })
    .in("id", ids)
    .eq("status", "shortlisted")
    .is("article_id", null)
    .select("id");

  if (error) return { ok: false, error: error.message };
  return { ok: true, count: data?.length ?? 0 };
}
