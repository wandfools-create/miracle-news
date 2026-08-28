import "server-only";

import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";
import { loadRecentCandidatesForSameEvent } from "@/lib/same-event/sameEventLookback";
import type { RelatedStoryPoolRow } from "@/lib/same-event/relatedStoriesMatch";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

export type {
  CandidateRelatedInput,
  RelatedStoryKind,
  RelatedStoryPoolRow,
  RelatedStoryRef,
} from "@/lib/same-event/relatedStoriesMatch";

export { batchRelatedStoriesForCandidates, findRelatedStoriesForDoc } from "@/lib/same-event/relatedStoriesMatch";

const DESK_LOOKBACK_DAYS = 14;
export const RELATED_STORY_POOL_ARTICLE_LIMIT = 400;

export type RelatedStoryPoolLoadResult = {
  pool: RelatedStoryPoolRow[];
  poolCapped: boolean;
};

function articleAdminMeta(r: {
  review_status: string | null;
  status: string | null;
  is_published: boolean | null;
  id: string;
}): { statusLabel: string; href: string | null } {
  if (
    r.status === ARTICLE_WORKFLOW.archived.status ||
    r.review_status === ARTICLE_WORKFLOW.archived.review_status
  ) {
    return { statusLabel: "보관됨", href: null };
  }
  if (
    r.status === ARTICLE_WORKFLOW.rejected.status ||
    r.review_status === ARTICLE_WORKFLOW.rejected.review_status
  ) {
    return { statusLabel: "반려됨", href: null };
  }
  if (r.is_published) {
    return { statusLabel: "공개됨", href: `/admin/review/${r.id}` };
  }
  if (r.review_status === ARTICLE_WORKFLOW.approved.review_status) {
    return {
      statusLabel: "승인 완료",
      href: `/admin/approved#approved-${r.id}`,
    };
  }
  if (r.review_status === ARTICLE_WORKFLOW.quickReview.review_status) {
    return {
      statusLabel: "빠른 검토",
      href: `/admin/quick-review/${r.id}`,
    };
  }
  if (r.review_status === ARTICLE_WORKFLOW.review.review_status) {
    return { statusLabel: "검토 대기", href: `/admin/review/${r.id}` };
  }
  if (r.review_status === ARTICLE_WORKFLOW.revision.review_status) {
    return { statusLabel: "수정 대기", href: `/admin/review/${r.id}` };
  }
  return { statusLabel: "검토", href: `/admin/review/${r.id}` };
}

export async function loadRelatedStoryPool(): Promise<RelatedStoryPoolLoadResult> {
  const candidates = await loadRecentCandidatesForSameEvent();
  const candidateRows: RelatedStoryPoolRow[] = candidates.map((c) => ({
    id: c.id,
    kind: "candidate",
    source: c.source,
    title: c.title,
    summary: c.summary,
    titleAlt: c.titleAlt,
    summaryAlt: c.summaryAlt,
    publishedAt: c.publishedAt,
    hasThumbnail: c.hasThumbnail,
    statusLabel: "수집 후보",
    href: `/admin/collection-candidates?highlight=${encodeURIComponent(c.id)}`,
  }));

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { pool: candidateRows, poolCapped: false };
  }

  try {
    const { client } = createServiceRoleSupabaseClient();
    const since = new Date(
      Date.now() - DESK_LOOKBACK_DAYS * 86_400_000
    ).toISOString();

    const { data, error } = await client
      .from("articles")
      .select(
        "id, source, title_ko, title_original, title_translated, summary_ko, summary_original, summary_translated, review_status, status, is_published, published_at, created_at, thumbnail_url"
      )
      .gte("created_at", since)
      .or(
        [
          `review_status.eq.${ARTICLE_WORKFLOW.quickReview.review_status}`,
          `review_status.eq.${ARTICLE_WORKFLOW.review.review_status}`,
          `review_status.eq.${ARTICLE_WORKFLOW.approved.review_status}`,
          "is_published.eq.true",
        ].join(",")
      )
      .order("created_at", { ascending: false })
      .limit(RELATED_STORY_POOL_ARTICLE_LIMIT);

    if (error) {
      console.warn("[related-stories] load articles failed", error.message);
      return { pool: candidateRows, poolCapped: false };
    }

    const poolCapped = (data?.length ?? 0) >= RELATED_STORY_POOL_ARTICLE_LIMIT;

    const articleRows: RelatedStoryPoolRow[] = (data ?? []).map((row) => {
      const r = row as {
        id: string;
        source: string;
        title_ko: string | null;
        title_original: string | null;
        title_translated: string | null;
        summary_ko: string | null;
        summary_original: string | null;
        summary_translated: string | null;
        review_status: string | null;
        status: string | null;
        is_published: boolean | null;
        published_at: string | null;
        created_at: string;
        thumbnail_url: string | null;
      };

      const title = (r.title_ko || r.title_translated || r.title_original || "").trim();
      const { statusLabel, href } = articleAdminMeta(r);

      return {
        id: r.id,
        kind: "article" as const,
        source: r.source,
        title,
        summary: r.summary_ko || r.summary_original,
        titleAlt: r.title_original,
        summaryAlt: r.summary_original,
        publishedAt: r.published_at || r.created_at,
        hasThumbnail: Boolean(r.thumbnail_url?.trim()),
        statusLabel,
        href: href,
      };
    });

    return { pool: [...candidateRows, ...articleRows], poolCapped };
  } catch (err) {
    console.warn("[related-stories] load articles threw", err);
    return { pool: candidateRows, poolCapped: false };
  }
}
