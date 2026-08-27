import type { HomeArticleCard } from "./types";

/** Rolling window for breaking/special/issue boost (not calendar day). */
export const EDITORIAL_PRIORITY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Primary window for sidebar / trending surfaces. */
export const HOME_SURFACE_PRIMARY_MS = 72 * 60 * 60 * 1000;

/** Fallback window when primary pool is thin — never go beyond this for those surfaces. */
export const HOME_SURFACE_FALLBACK_MS = 7 * 24 * 60 * 60 * 1000;

export const EDITORIAL_PRIORITIES = [
  "normal",
  "issue",
  "special",
  "breaking",
] as const;

export type EditorialPriority = (typeof EDITORIAL_PRIORITIES)[number];

const PRIORITY_RANK: Record<EditorialPriority, number> = {
  normal: 0,
  issue: 1,
  special: 2,
  breaking: 3,
};

export function normalizeEditorialPriority(
  value: unknown
): EditorialPriority {
  if (typeof value !== "string") return "normal";
  const normalized = value.trim().toLowerCase();
  return (EDITORIAL_PRIORITIES as readonly string[]).includes(normalized)
    ? (normalized as EditorialPriority)
    : "normal";
}

export function parseTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * News freshness clock: prefer original source publish time.
 * Fall back to site published_at, then localization created_at.
 * @deprecated For home ranking prefer getEditorialFreshnessTimestamp (site publish first).
 */
export function getSourceFreshnessTimestamp(article: HomeArticleCard): number {
  const source = parseTimestamp(article.source_published_at);
  if (source > 0) return source;
  const site = parseTimestamp(article.published_at);
  if (site > 0) return site;
  return parseTimestamp(article.created_at);
}

/** Site publish time only (한눈 공개 시각). */
export function getSitePublishedTimestamp(article: HomeArticleCard): number {
  return parseTimestamp(article.published_at);
}

/**
 * Home editorial freshness: prefer Hannoon published_at, then source, then created.
 */
export function getEditorialFreshnessTimestamp(
  article: HomeArticleCard
): number {
  const site = parseTimestamp(article.published_at);
  if (site > 0) return site;
  const source = parseTimestamp(article.source_published_at);
  if (source > 0) return source;
  return parseTimestamp(article.created_at);
}

export function getEditorialPriorityRank(
  article: HomeArticleCard,
  nowMs: number = Date.now()
): number {
  const priority = normalizeEditorialPriority(article.editorial_priority);
  if (priority === "normal") return 0;

  const freshness = getEditorialFreshnessTimestamp(article);
  if (freshness <= 0) return 0;
  if (nowMs - freshness > EDITORIAL_PRIORITY_WINDOW_MS) return 0;

  return PRIORITY_RANK[priority];
}

/**
 * Legacy home / sidebar / trending sort (pre Phase 1).
 * Prefer compareArticlesByEditorialScore for new home surfaces.
 */
export function compareArticlesByFreshness(
  a: HomeArticleCard,
  b: HomeArticleCard,
  nowMs: number = Date.now()
): number {
  const rankDiff =
    getEditorialPriorityRank(b, nowMs) - getEditorialPriorityRank(a, nowMs);
  if (rankDiff !== 0) return rankDiff;

  const freshnessDiff =
    getEditorialFreshnessTimestamp(b) - getEditorialFreshnessTimestamp(a);
  if (freshnessDiff !== 0) return freshnessDiff;

  return getSitePublishedTimestamp(b) - getSitePublishedTimestamp(a);
}

export function sortArticlesByFreshness(
  articles: HomeArticleCard[],
  nowMs: number = Date.now()
): HomeArticleCard[] {
  return [...articles].sort((a, b) => compareArticlesByFreshness(a, b, nowMs));
}

function isWithinWindow(
  article: HomeArticleCard,
  nowMs: number,
  windowMs: number
): boolean {
  const freshness = getEditorialFreshnessTimestamp(article);
  if (freshness <= 0) return false;
  return nowMs - freshness <= windowMs;
}

/**
 * Prefer articles within the primary window; if fewer than `minCount`,
 * expand to the fallback window. Never includes older than fallback.
 * `allowManualTopStory` is ignored (deprecated) — stale pins must not inject.
 * Windows use site published_at first (editorial freshness).
 */
export function filterArticlesForHomeSurface(
  articles: HomeArticleCard[],
  options?: {
    nowMs?: number;
    primaryMs?: number;
    fallbackMs?: number;
    minCount?: number;
    /** @deprecated Ignored — out-of-window top stories are never injected. */
    allowManualTopStory?: boolean;
  }
): HomeArticleCard[] {
  const nowMs = options?.nowMs ?? Date.now();
  const primaryMs = options?.primaryMs ?? HOME_SURFACE_PRIMARY_MS;
  const fallbackMs = options?.fallbackMs ?? HOME_SURFACE_FALLBACK_MS;
  const minCount = options?.minCount ?? 1;

  const primary = articles.filter((a) => isWithinWindow(a, nowMs, primaryMs));
  if (primary.length >= minCount) return primary;
  return articles.filter((a) => isWithinWindow(a, nowMs, fallbackMs));
}
