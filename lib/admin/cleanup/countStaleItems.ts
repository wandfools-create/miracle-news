import "server-only";

import {
  EXPIREABLE_CANDIDATE_STATUSES,
  ARCHIVEABLE_ARTICLE_STATUS,
  ARCHIVEABLE_REVIEW_STATUS,
  cleanupCutoffIso,
  isArchiveableRejectedArticle,
  isArchiveableReviewArticle,
  isExpireableCollectionCandidate,
} from "@/lib/admin/cleanup/cleanupRules";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

export type StaleCleanupCounts = {
  cutoffIso: string;
  collectionCandidates: number;
  reviewArticles: number;
  rejectedArticles: number;
  error: string | null;
};

const PAGE = 500;

async function countExpireableCandidates(
  client: ReturnType<typeof createServiceRoleSupabaseClient>["client"],
  cutoffIso: string
): Promise<number> {
  let total = 0;
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from("collection_candidates")
      .select("id, status, article_id, created_at, rss_published_at")
      .in("status", [...EXPIREABLE_CANDIDATE_STATUSES])
      .is("article_id", null)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      if (isExpireableCollectionCandidate(row, cutoffIso)) total += 1;
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return total;
}

async function countArchiveableArticles(
  client: ReturnType<typeof createServiceRoleSupabaseClient>["client"],
  cutoffIso: string
): Promise<number> {
  let total = 0;
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from("articles")
      .select(
        "id, status, review_status, is_published, is_top_story, collected_at, created_at"
      )
      .eq("status", ARCHIVEABLE_ARTICLE_STATUS)
      .eq("review_status", ARCHIVEABLE_REVIEW_STATUS)
      .eq("is_published", false)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      if (isArchiveableReviewArticle(row, cutoffIso)) total += 1;
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return total;
}

async function countArchiveableRejected(
  client: ReturnType<typeof createServiceRoleSupabaseClient>["client"],
  cutoffIso: string
): Promise<number> {
  let total = 0;
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from("articles")
      .select(
        "id, status, review_status, is_published, is_top_story, collected_at, created_at, updated_at"
      )
      .eq("status", "rejected")
      .eq("review_status", "rejected")
      .eq("is_published", false)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      if (isArchiveableRejectedArticle(row, cutoffIso)) total += 1;
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return total;
}

export async function countStaleCleanupTargets(): Promise<StaleCleanupCounts> {
  const cutoffIso = cleanupCutoffIso();
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return {
      cutoffIso,
      collectionCandidates: 0,
      reviewArticles: 0,
      rejectedArticles: 0,
      error: envCheck.error,
    };
  }

  const { client } = createServiceRoleSupabaseClient();
  try {
    const [collectionCandidates, reviewArticles, rejectedArticles] =
      await Promise.all([
        countExpireableCandidates(client, cutoffIso),
        countArchiveableArticles(client, cutoffIso),
        countArchiveableRejected(client, cutoffIso),
      ]);
    return {
      cutoffIso,
      collectionCandidates,
      reviewArticles,
      rejectedArticles,
      error: null,
    };
  } catch (e) {
    return {
      cutoffIso,
      collectionCandidates: 0,
      reviewArticles: 0,
      rejectedArticles: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
