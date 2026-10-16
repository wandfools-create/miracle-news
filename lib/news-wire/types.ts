import type { CollectionCandidateStatus } from "@/lib/collection-candidates/types";
import type { ArticleLocale } from "@/lib/article/formatPublishedDate";

/**
 * Statuses for homepage News Wire preview only.
 * Keeps existing home behavior (excludes enriched / expired).
 */
export const NEWS_WIRE_INCLUDE_STATUSES: CollectionCandidateStatus[] = [
  "pending",
  "shortlisted",
  "enriching",
  "enrich_failed",
];

/**
 * Statuses for the permanent /wire day archive.
 * Includes articleized (`enriched`) and soft time-expiry (`expired`) rows.
 * `selected` is a valid collected desk state between shortlist and enrich.
 * Excludes only `dismissed` (plus dangerous URLs at sanitize time).
 */
export const NEWS_WIRE_ARCHIVE_INCLUDE_STATUSES: CollectionCandidateStatus[] = [
  "pending",
  "shortlisted",
  "selected",
  "enriching",
  "enrich_failed",
  "enriched",
  "expired",
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

/**
 * Server-only lean select — includes sort fields never sent to the client.
 * Does not select translation columns (runtime uses original rss_title only).
 */
export const NEWS_WIRE_DB_SELECT = `
  id,
  source,
  feed_label,
  original_url,
  rss_title,
  rss_published_at,
  created_at,
  status,
  article_id,
  ai_recommend_grade,
  ai_recommend_score
`.replace(/\s+/g, " ").trim();

/** Internal row used for filtering/ranking on the server only. */
export type NewsWireDbRow = {
  id: string;
  source: string;
  feed_label: string | null;
  original_url: string;
  rss_title: string;
  rss_published_at: string | null;
  created_at: string;
  status: CollectionCandidateStatus;
  article_id: string | null;
  ai_recommend_grade: string | null;
  ai_recommend_score: number | null;
};

/**
 * Public DTO for RSC/client props — whitelist only.
 * No AI grade/score, article_id, or translation-status fields.
 * `hannoonHref` is set only when a linked article is actually public for the locale.
 */
export type NewsWireItem = {
  id: string;
  title: string;
  sourceLabel: string;
  publishedAt: string | null;
  collectedAt: string;
  originalUrl: string;
  /** Public locale article path, or null when mark must stay hidden. */
  hannoonHref: string | null;
};

export type NewsWireLocale = ArticleLocale;
