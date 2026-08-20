import "server-only";

import { supabase } from "@/lib/supabase";

/** Columns that exist on `articles` (no `body_ko` — Korean body uses `body_translated`). */
export const REVIEW_QUEUE_ARTICLE_SELECT = `
  id,
  source,
  source_section,
  original_url,
  title_original,
  title_translated,
  title_ko,
  summary_original,
  summary_translated,
  summary_ko,
  body_original,
  body_translated,
  category,
  ai_review_status,
  review_status,
  status,
  thumbnail_url,
  published_at,
  collected_at,
  ai_review_notes
`;

export type ReviewQueueFetchRow = {
  id: string;
  source: string | null;
  source_section?: string | null;
  original_url: string | null;
  title_original: string | null;
  title_translated: string | null;
  title_ko: string | null;
  summary_original: string | null;
  summary_translated: string | null;
  summary_ko: string | null;
  body_original?: string | null;
  body_translated?: string | null;
  category: string | null;
  ai_review_status: string | null;
  review_status: string | null;
  status: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  collected_at: string | null;
  ai_review_notes?: string | null;
};

export type FetchReviewQueueResult = {
  articles: ReviewQueueFetchRow[];
  error: { code?: string; message: string; hint?: string | null } | null;
  limitApplied: number | null;
};

export function getReviewDebugLimit(): number | undefined {
  const raw = process.env.REVIEW_DEBUG_LIMIT?.trim();
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export async function fetchReviewQueueArticles(): Promise<FetchReviewQueueResult> {
  const limit = getReviewDebugLimit();

  console.info("[admin/review] fetch start", {
    limit: limit ?? "none",
    select: "REVIEW_QUEUE_ARTICLE_SELECT",
  });

  let query = supabase
    .from("articles")
    .select(REVIEW_QUEUE_ARTICLE_SELECT)
    .eq("status", "ready_for_human_review")
    .eq("review_status", "pending")
    .order("collected_at", { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[admin/review] supabase query failed", {
      code: error.code,
      message: error.message,
      hint: error.hint,
      details: error.details,
      limit,
    });
    return {
      articles: [],
      error: {
        code: error.code,
        message: error.message,
        hint: error.hint,
      },
      limitApplied: limit ?? null,
    };
  }

  const articles = (data ?? []) as ReviewQueueFetchRow[];

  console.info("[admin/review] fetch ok", {
    rowCount: articles.length,
    limitApplied: limit ?? null,
    sampleIds: articles.slice(0, 5).map((a) => a.id),
  });

  return {
    articles,
    error: null,
    limitApplied: limit ?? null,
  };
}
