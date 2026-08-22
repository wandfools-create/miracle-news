import type { HomeArticleCard } from "./types";

/** Rolling window for breaking/special/issue boost (not calendar day). */
export const EDITORIAL_PRIORITY_WINDOW_MS = 24 * 60 * 60 * 1000;

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

export function getEditorialPriorityRank(
  article: HomeArticleCard,
  nowMs: number = Date.now()
): number {
  const priority = normalizeEditorialPriority(article.editorial_priority);
  if (priority === "normal") return 0;

  const freshness = getSourceFreshnessTimestamp(article);
  if (freshness <= 0) return 0;
  if (nowMs - freshness > EDITORIAL_PRIORITY_WINDOW_MS) return 0;

  return PRIORITY_RANK[priority];
}

/**
 * Home / sidebar / trending sort:
 * 1) active editorial boost within rolling 24h (breaking > special > issue)
 * 2) source freshness newest-first
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
    getSourceFreshnessTimestamp(b) - getSourceFreshnessTimestamp(a);
  if (freshnessDiff !== 0) return freshnessDiff;

  return getSitePublishedTimestamp(b) - getSitePublishedTimestamp(a);
}

export function sortArticlesByFreshness(
  articles: HomeArticleCard[],
  nowMs: number = Date.now()
): HomeArticleCard[] {
  return [...articles].sort((a, b) => compareArticlesByFreshness(a, b, nowMs));
}
