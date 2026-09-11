import type { CollectionCandidateStatus } from "@/lib/collection-candidates/types";
import type { ArticleLocale } from "@/lib/article/formatPublishedDate";

/** Statuses shown on the public News Wire. */
export const NEWS_WIRE_INCLUDE_STATUSES: CollectionCandidateStatus[] = [
  "pending",
  "shortlisted",
  "enriching",
  "enrich_failed",
];

export const NEWS_WIRE_EXCLUDE_STATUSES: CollectionCandidateStatus[] = [
  "dismissed",
  "expired",
  "enriched",
];

export const NEWS_WIRE_HOME_LIMIT = 8;
export const NEWS_WIRE_HOME_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** Unevaluated items newer than this float above normal/low grades. */
export const NEWS_WIRE_VERY_RECENT_MS = 3 * 60 * 60 * 1000;
export const NEWS_WIRE_PAGE_SIZE = 50;
/** Hard cap for page query param (finite positive integer). */
export const NEWS_WIRE_MAX_PAGE = 200;
export const NEWS_WIRE_FETCH_PAGE_SIZE = 50;
export const NEWS_WIRE_FETCH_MAX_PAGES = 200;

/** Server-only lean select — includes sort fields never sent to the client. */
export const NEWS_WIRE_DB_SELECT = `
  id,
  source,
  feed_label,
  original_url,
  rss_title,
  rss_title_ko,
  rss_title_en,
  rss_published_at,
  created_at,
  status,
  article_id,
  ai_recommend_grade,
  ai_recommend_score,
  wire_titles_ready_at
`.replace(/\s+/g, " ").trim();

/** Internal row used for filtering/ranking on the server only. */
export type NewsWireDbRow = {
  id: string;
  source: string;
  feed_label: string | null;
  original_url: string;
  rss_title: string;
  rss_title_ko: string | null;
  rss_title_en?: string | null;
  rss_published_at: string | null;
  created_at: string;
  status: CollectionCandidateStatus;
  article_id: string | null;
  ai_recommend_grade: string | null;
  ai_recommend_score: number | null;
  wire_titles_ready_at?: string | null;
};

/**
 * Public DTO for RSC/client props — whitelist only.
 * No AI grade/score, article_id, or translation-status fields.
 */
export type NewsWireItem = {
  id: string;
  title: string;
  sourceLabel: string;
  publishedAt: string | null;
  collectedAt: string;
  originalUrl: string;
};

export type NewsWireLocale = ArticleLocale;
