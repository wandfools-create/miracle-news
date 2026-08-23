import "server-only";

import {
  EXPIREABLE_CANDIDATE_STATUSES,
  cleanupCutoffIso,
  isExpireableCollectionCandidate,
} from "@/lib/admin/cleanup/cleanupRules";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

const PAGE = 500;
const UPDATE_CHUNK = 100;

export type ExpireStaleCandidatesResult =
  | { ok: true; expiredCount: number; cutoffIso: string }
  | { ok: false; error: string; step: string };

/** Soft-expire unused candidates → status=expired. No hard delete. No OpenAI. */
export async function expireStaleCollectionCandidates(): Promise<ExpireStaleCandidatesResult> {
  const cutoffIso = cleanupCutoffIso();
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error, step: envCheck.step };
  }

  const { client } = createServiceRoleSupabaseClient();
  const ids: string[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await client
      .from("collection_candidates")
      .select("id, status, article_id, created_at, rss_published_at")
      .in("status", [...EXPIREABLE_CANDIDATE_STATUSES])
      .is("article_id", null)
      .range(from, from + PAGE - 1);

    if (error) {
      return { ok: false, error: error.message, step: "fetch_candidates" };
    }
    const rows = data ?? [];
    for (const row of rows) {
      if (isExpireableCollectionCandidate(row, cutoffIso)) {
        ids.push(row.id);
      }
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  if (ids.length === 0) {
    return { ok: true, expiredCount: 0, cutoffIso };
  }

  const now = new Date().toISOString();
  let expiredCount = 0;

  for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
    const chunk = ids.slice(i, i + UPDATE_CHUNK);
    const { data, error } = await client
      .from("collection_candidates")
      .update({ status: "expired", updated_at: now })
      .in("id", chunk)
      .in("status", [...EXPIREABLE_CANDIDATE_STATUSES])
      .is("article_id", null)
      .select("id");

    if (error) {
      return { ok: false, error: error.message, step: "expire_update" };
    }
    expiredCount += data?.length ?? 0;
  }

  console.info("[admin/cleanup] expired collection candidates", {
    expiredCount,
    cutoffIso,
  });

  return { ok: true, expiredCount, cutoffIso };
}
