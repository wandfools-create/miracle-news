import "server-only";

import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";
import { DISMISSABLE_CANDIDATE_STATUSES } from "@/lib/collection-candidates/dismissCollectionCandidate";

const EXPIRABLE = [
  "pending",
  "shortlisted",
  "enrich_failed",
  "enriching",
  "selected",
  "dismissed",
] as const;

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

/** Soft-dismiss many candidates. No OpenAI. */
export async function dismissCollectionCandidatesBulk(input: {
  candidateIds: string[];
  dismissedBy?: string | null;
}): Promise<
  | { ok: true; count: number; ids: string[] }
  | { ok: false; error: string }
> {
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
      status: "dismissed",
      dismissed_at: now,
      dismissed_by: input.dismissedBy?.trim() || null,
    })
    .in("id", ids)
    .in("status", [...DISMISSABLE_CANDIDATE_STATUSES])
    .select("id");

  if (error) {
    console.error("[collection-candidates] dismiss bulk failed", error.message);
    return { ok: false, error: error.message };
  }
  const updatedIds = (data ?? []).map((row) => String((row as { id: string }).id));
  console.info("[collection-candidates] dismissed bulk", {
    requested: ids.length,
    updated: updatedIds.length,
  });
  return { ok: true, count: updatedIds.length, ids: updatedIds };
}

/** Soft-expire many candidates. No OpenAI. Never touches linked articles. */
export async function expireCollectionCandidatesBulk(input: {
  candidateIds: string[];
}): Promise<
  | { ok: true; count: number; ids: string[] }
  | { ok: false; error: string }
> {
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
      status: "expired",
      updated_at: now,
    })
    .in("id", ids)
    .in("status", [...EXPIRABLE])
    .is("article_id", null)
    .select("id");

  if (error) return { ok: false, error: error.message };
  const updatedIds = (data ?? []).map((row) => String((row as { id: string }).id));
  return { ok: true, count: updatedIds.length, ids: updatedIds };
}
