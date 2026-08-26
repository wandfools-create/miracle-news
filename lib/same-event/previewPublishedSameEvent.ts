import "server-only";

import { resolvePublishCopy } from "@/lib/articles/quickPublishGuards";
import type { SameEventPublishMatch } from "@/lib/articles/publishArticle";
import {
  evaluatePublishedSameEventGuard,
  loadRecentPublishedForSameEvent,
  type SameEventPublishedRow,
} from "@/lib/same-event/sameEventLookback";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

function toMatch(row: SameEventPublishedRow): SameEventPublishMatch {
  return {
    id: row.id,
    source: row.source,
    title: row.title,
    publishedAt: row.published_at,
  };
}

/**
 * Preview same-event collision for admin UI (no writes).
 */
export async function previewPublishedSameEventForArticle(
  articleId: string
): Promise<{
  blocked: boolean;
  match?: SameEventPublishMatch;
  softWarning?: SameEventPublishMatch;
}> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return { blocked: false };

  const { client } = createServiceRoleSupabaseClient();
  const { data, error } = await client
    .from("articles")
    .select(
      "id, source, title_ko, title_original, title_translated, summary_ko, summary_original, summary_translated, published_at, thumbnail_url"
    )
    .eq("id", articleId)
    .maybeSingle();

  if (error || !data) return { blocked: false };

  const row = data as {
    id: string;
    source: string | null;
    title_ko: string | null;
    title_original: string | null;
    title_translated: string | null;
    summary_ko: string | null;
    summary_original: string | null;
    summary_translated: string | null;
    published_at: string | null;
    thumbnail_url: string | null;
  };

  const copy = resolvePublishCopy({
    id: row.id,
    published_at: row.published_at,
    title_original: row.title_original,
    body_original: null,
    summary_original: row.summary_original,
    title_translated: row.title_translated,
    body_translated: null,
    summary_translated: row.summary_translated,
    title_ko: row.title_ko,
    summary_ko: row.summary_ko,
    review_status: null,
    status: null,
    is_published: false,
    ai_review_status: null,
    ai_review_notes: null,
  });

  const published = await loadRecentPublishedForSameEvent();
  const guard = evaluatePublishedSameEventGuard(
    {
      title: copy.koTitle || copy.enTitle,
      summary: copy.koSummary || copy.enSummary,
      titleAlt: copy.enTitle || copy.koTitle,
      summaryAlt: copy.enSummary || copy.koSummary,
      source: row.source,
      publishedAt: row.published_at,
      hasThumbnail: Boolean(row.thumbnail_url?.trim()),
    },
    published,
    { excludeArticleId: articleId }
  );

  if (guard.blocked) {
    return { blocked: true, match: toMatch(guard.match) };
  }
  if (guard.softWarning) {
    return { blocked: false, softWarning: toMatch(guard.softWarning) };
  }
  return { blocked: false };
}
