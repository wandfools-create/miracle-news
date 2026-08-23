import "server-only";

import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";
import {
  ARCHIVEABLE_ARTICLE_STATUS,
  ARCHIVEABLE_REVIEW_STATUS,
  cleanupCutoffIso,
  isArchiveableReviewArticle,
} from "@/lib/admin/cleanup/cleanupRules";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

const PAGE = 500;
const UPDATE_CHUNK = 100;

export type ArchiveStaleReviewArticlesResult =
  | { ok: true; archivedCount: number; cutoffIso: string }
  | { ok: false; error: string; step: string };

/**
 * Soft-archive stale review-queue drafts → status/review_status=archived.
 * Never touches published / approved / hold / revision / is_top_story.
 * No hard delete. No OpenAI.
 */
export async function archiveStaleReviewArticles(): Promise<ArchiveStaleReviewArticlesResult> {
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
      .from("articles")
      .select(
        "id, status, review_status, is_published, is_top_story, collected_at, created_at"
      )
      .eq("status", ARCHIVEABLE_ARTICLE_STATUS)
      .eq("review_status", ARCHIVEABLE_REVIEW_STATUS)
      .eq("is_published", false)
      .range(from, from + PAGE - 1);

    if (error) {
      return { ok: false, error: error.message, step: "fetch_articles" };
    }
    const rows = data ?? [];
    for (const row of rows) {
      if (isArchiveableReviewArticle(row, cutoffIso)) {
        ids.push(row.id);
      }
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  if (ids.length === 0) {
    return { ok: true, archivedCount: 0, cutoffIso };
  }

  let archivedCount = 0;

  for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
    const chunk = ids.slice(i, i + UPDATE_CHUNK);
    const { data, error } = await client
      .from("articles")
      .update({
        status: ARTICLE_WORKFLOW.archived.status,
        review_status: ARTICLE_WORKFLOW.archived.review_status,
        is_published: false,
      })
      .in("id", chunk)
      .eq("status", ARCHIVEABLE_ARTICLE_STATUS)
      .eq("review_status", ARCHIVEABLE_REVIEW_STATUS)
      .eq("is_published", false)
      .or("is_top_story.is.null,is_top_story.eq.false")
      .select("id");

    if (error) {
      return { ok: false, error: error.message, step: "archive_update" };
    }
    archivedCount += data?.length ?? 0;
  }

  console.info("[admin/cleanup] archived review articles", {
    archivedCount,
    cutoffIso,
  });

  return { ok: true, archivedCount, cutoffIso };
}
