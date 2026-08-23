import "server-only";

import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";
import {
  cleanupCutoffIso,
  isArchiveableRejectedArticle,
} from "@/lib/admin/cleanup/cleanupRules";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

const PAGE = 500;
const UPDATE_CHUNK = 100;

export type ArchiveStaleRejectedResult =
  | { ok: true; archivedCount: number; cutoffIso: string }
  | { ok: false; error: string; step: string };

/** Soft-archive rejected articles older than retention. No hard delete. */
export async function archiveStaleRejectedArticles(): Promise<ArchiveStaleRejectedResult> {
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
        "id, status, review_status, is_published, is_top_story, collected_at, created_at, updated_at"
      )
      .eq("status", "rejected")
      .eq("review_status", "rejected")
      .eq("is_published", false)
      .range(from, from + PAGE - 1);

    if (error) {
      return { ok: false, error: error.message, step: "fetch_rejected" };
    }
    const rows = data ?? [];
    for (const row of rows) {
      if (isArchiveableRejectedArticle(row, cutoffIso)) {
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
      .eq("status", "rejected")
      .eq("review_status", "rejected")
      .eq("is_published", false)
      .or("is_top_story.is.null,is_top_story.eq.false")
      .select("id");

    if (error) {
      return { ok: false, error: error.message, step: "archive_rejected_update" };
    }
    archivedCount += data?.length ?? 0;
  }

  console.info("[admin/cleanup] archived rejected articles", {
    archivedCount,
    cutoffIso,
  });

  return { ok: true, archivedCount, cutoffIso };
}
