import { getSourceFeaturedSortBias } from "@/lib/article/sourcePolicy";
import { normalizeSource } from "@/lib/article/normalizeSource";
import {
  compareArticlesByFreshness,
  getSourceFreshnessTimestamp,
  getSitePublishedTimestamp,
  sortArticlesByFreshness,
} from "./articleFreshness";
import type { HomeArticleCard } from "./types";

/** Featured hero only considers articles with source freshness within this many days. */
export const FEATURED_RECENT_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** @deprecated Prefer getSourceFreshnessTimestamp — kept for call sites expecting site/legacy clock. */
export function getPublishedTimestamp(article: HomeArticleCard): number {
  return getSourceFreshnessTimestamp(article);
}

export function isFeaturedCandidate(
  article: HomeArticleCard,
  nowMs: number = Date.now()
): boolean {
  const freshnessMs = getSourceFreshnessTimestamp(article);
  if (freshnessMs <= 0) return false;
  const cutoff = nowMs - FEATURED_RECENT_DAYS * MS_PER_DAY;
  return freshnessMs >= cutoff;
}

function effectiveFeaturedTimestamp(
  article: HomeArticleCard,
  nowMs: number
): number {
  const freshness = getSourceFreshnessTimestamp(article);
  if (freshness <= 0) return 0;
  // Reuse compareArticlesByFreshness ordering via a synthetic score:
  // editorial boost is applied in compareFeaturedCandidates directly.
  void nowMs;
  return freshness - getSourceFeaturedSortBias(normalizeSource(article.source));
}

function isManualTopStory(article: HomeArticleCard): boolean {
  return article.is_top_story === true;
}

function compareManualTopStories(
  a: HomeArticleCard,
  b: HomeArticleCard
): number {
  const orderA = a.top_story_order ?? 0;
  const orderB = b.top_story_order ?? 0;
  if (orderA !== orderB) return orderA - orderB;

  const freshnessDiff =
    getSourceFreshnessTimestamp(b) - getSourceFreshnessTimestamp(a);
  if (freshnessDiff !== 0) return freshnessDiff;

  return getSitePublishedTimestamp(b) - getSitePublishedTimestamp(a);
}

export function compareFeaturedCandidates(
  a: HomeArticleCard,
  b: HomeArticleCard,
  nowMs: number = Date.now()
): number {
  const freshnessCmp = compareArticlesByFreshness(a, b, nowMs);
  if (freshnessCmp !== 0) return freshnessCmp;

  return (
    effectiveFeaturedTimestamp(b, nowMs) - effectiveFeaturedTimestamp(a, nowMs)
  );
}

export function pickFeaturedArticle(
  articles: HomeArticleCard[],
  nowMs: number = Date.now()
): HomeArticleCard | null {
  const manual = articles.filter(isManualTopStory);
  if (manual.length > 0) {
    return [...manual].sort(compareManualTopStories)[0] ?? null;
  }

  const candidates = articles.filter((a) => isFeaturedCandidate(a, nowMs));
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) =>
    compareFeaturedCandidates(a, b, nowMs)
  )[0] ?? null;
}

/**
 * Site-wide home ordering: editorial boost (rolling 24h) then source freshness.
 */
export function sortHomeArticlesForDisplay(
  articles: HomeArticleCard[],
  nowMs: number = Date.now()
): HomeArticleCard[] {
  return sortArticlesByFreshness(articles, nowMs);
}
