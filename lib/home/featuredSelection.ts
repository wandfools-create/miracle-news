import { getSourceFeaturedSortBias } from "@/lib/article/sourcePolicy";
import { normalizeSource } from "@/lib/article/normalizeSource";
import {
  compareArticlesByFreshness,
  EDITORIAL_PRIORITY_WINDOW_MS,
  filterArticlesForHomeSurface,
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

/** is_top_story boost is active only within rolling 24h of source freshness. */
export function isActiveTopStory(
  article: HomeArticleCard,
  nowMs: number = Date.now()
): boolean {
  if (article.is_top_story !== true) return false;
  const freshness = getSourceFreshnessTimestamp(article);
  if (freshness <= 0) return false;
  return nowMs - freshness <= EDITORIAL_PRIORITY_WINDOW_MS;
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
  void nowMs;
  return freshness - getSourceFeaturedSortBias(normalizeSource(article.source));
}

function compareActiveTopStories(
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

/**
 * 오늘의 주요 기사:
 * 1) active is_top_story within rolling 24h (top_story_order among those)
 * 2) else editorial_priority boost (24h) + source_published_at within 7d
 */
export function pickFeaturedArticle(
  articles: HomeArticleCard[],
  nowMs: number = Date.now()
): HomeArticleCard | null {
  const activeTops = articles.filter((a) => isActiveTopStory(a, nowMs));
  if (activeTops.length > 0) {
    return [...activeTops].sort(compareActiveTopStories)[0] ?? null;
  }

  const candidates = articles.filter((a) => isFeaturedCandidate(a, nowMs));
  if (candidates.length === 0) return null;
  return (
    [...candidates].sort((a, b) => compareFeaturedCandidates(a, b, nowMs))[0] ??
    null
  );
}

function articleKey(article: HomeArticleCard): string {
  return article.article_id ?? article.id;
}

/**
 * Featured combo: secondary lead + numbered related list.
 * Uses 72h then 7d fallback; excludes featured; never older than 7d.
 */
export function pickFeaturedHubArticles(
  articles: HomeArticleCard[],
  featured: HomeArticleCard | null,
  options?: { relatedLimit?: number; nowMs?: number }
): { leads: HomeArticleCard[]; related: HomeArticleCard[] } {
  const nowMs = options?.nowMs ?? Date.now();
  const relatedLimit = options?.relatedLimit ?? 5;
  const featuredKey = featured ? articleKey(featured) : null;

  const withoutFeatured = articles.filter(
    (a) => articleKey(a) !== featuredKey && a.id !== featured?.id
  );

  const recent = filterArticlesForHomeSurface(withoutFeatured, {
    nowMs,
    minCount: relatedLimit + 1,
    allowManualTopStory: false,
  });
  const sorted = sortArticlesByFreshness(recent, nowMs);

  const leads: HomeArticleCard[] = [];
  if (featured) leads.push(featured);
  if (sorted[0]) leads.push(sorted[0]);

  const leadKeys = new Set(leads.map(articleKey));
  const related = sorted
    .filter((a) => !leadKeys.has(articleKey(a)))
    .slice(0, relatedLimit);

  return { leads, related };
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
