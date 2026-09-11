import type { AiRecommendGrade } from "@/lib/collection-candidates/candidateRecommend";
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

/** Lean columns only — never expose failure details, Discord fields, or summaries. */
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

/** Public DTO — whitelist for page props. */
export type NewsWireItem = {
  id: string;
  title: string;
  sourceKey: string;
  sourceLabel: string;
  publishedAt: string | null;
  collectedAt: string;
  originalUrl: string;
  /** Internal sort only — not rendered. */
  aiRecommendGrade: AiRecommendGrade | null;
  aiRecommendScore: number | null;
};

export type NewsWireLocale = ArticleLocale;
