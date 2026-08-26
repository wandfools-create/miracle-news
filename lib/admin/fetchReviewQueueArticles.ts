import "server-only";

import { getAdminNavCounts } from "@/lib/admin/adminNavCounts";
import { supabase } from "@/lib/supabase";
import {
  ADMIN_LIST_PAGE_SIZE,
  adminListRange,
  parseAdminListPage,
} from "@/lib/admin/listPagination";

/** Detail / full review — includes body columns. */
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
  created_at,
  ai_review_notes,
  editorial_priority
`;

/** List cards — omit heavy body columns. */
export const REVIEW_QUEUE_LIST_SELECT = `
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
  category,
  ai_review_status,
  review_status,
  status,
  thumbnail_url,
  published_at,
  collected_at,
  created_at,
  ai_review_notes,
  editorial_priority
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
  created_at?: string | null;
  ai_review_notes?: string | null;
  editorial_priority?: string | null;
};

export type ReviewQueueListQuery = {
  page: number;
  q: string;
};

export type FetchReviewQueueResult = {
  articles: ReviewQueueFetchRow[];
  error: { code?: string; message: string; hint?: string | null } | null;
  pageSize: number;
  page: number;
  totalCount: number;
  debugLimitApplied: number | null;
};

export function getReviewDebugLimit(): number | undefined {
  const raw = process.env.REVIEW_DEBUG_LIMIT?.trim();
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function escapeIlike(value: string): string {
  return value.replace(/[%_,]/g, " ").replace(/\s+/g, " ").trim();
}

export function parseReviewQueueListQuery(input: {
  page?: string | null;
  q?: string | null;
}): ReviewQueueListQuery {
  return {
    page: parseAdminListPage(input.page),
    q: String(input.q ?? "").trim(),
  };
}

export async function fetchReviewQueueArticles(
  input?: ReviewQueueListQuery
): Promise<FetchReviewQueueResult> {
  const query = input ?? { page: 1, q: "" };
  const debugLimit = getReviewDebugLimit();
  const pageSize = debugLimit
    ? Math.min(debugLimit, ADMIN_LIST_PAGE_SIZE)
    : ADMIN_LIST_PAGE_SIZE;
  const { from, to } = adminListRange(query.page, pageSize);
  const hasSearch = query.q.length > 0;

  let db = supabase
    .from("articles")
    .select(
      REVIEW_QUEUE_LIST_SELECT,
      hasSearch ? { count: "exact" } : undefined
    )
    .eq("status", "ready_for_human_review")
    .eq("review_status", "pending")
    .neq("status", "archived")
    .order("collected_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false });

  if (hasSearch) {
    const term = escapeIlike(query.q);
    if (term) {
      const pattern = `"%${term.replace(/"/g, "")}%"`;
      db = db.or(
        [
          `title_ko.ilike.${pattern}`,
          `title_original.ilike.${pattern}`,
          `title_translated.ilike.${pattern}`,
          `source.ilike.${pattern}`,
          `original_url.ilike.${pattern}`,
          `category.ilike.${pattern}`,
        ].join(",")
      );
    }
  }

  const { data, error, count } = await db.range(from, to);

  if (error) {
    return {
      articles: [],
      error: {
        code: error.code,
        message: error.message,
        hint: error.hint,
      },
      pageSize,
      page: query.page,
      totalCount: 0,
      debugLimitApplied: debugLimit ?? null,
    };
  }

  const articles = (data ?? []) as ReviewQueueFetchRow[];
  const totalCount = hasSearch
    ? (count ?? 0)
    : (await getAdminNavCounts()).review;

  return {
    articles,
    error: null,
    pageSize,
    page: query.page,
    totalCount,
    debugLimitApplied: debugLimit ?? null,
  };
}
