import { getSourceFeaturedSortBias } from "@/lib/article/sourcePolicy";
import { normalizeSource } from "@/lib/article/normalizeSource";
import {
  filterArticlesForHomeSurface,
  getSitePublishedTimestamp,
} from "./articleFreshness";
import {
  compareArticlesByEditorialScore,
  getEditorialFreshnessTimestamp,
  pickDiversifiedByEditorialScore,
  sortArticlesByEditorialScore,
} from "./editorialRanking";
import type { HomeArticleCard } from "./types";

/** Featured hero only considers articles with site freshness within this many days. */
export const FEATURED_RECENT_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** @deprecated Prefer getEditorialFreshnessTimestamp for ranking. */
export function getPublishedTimestamp(article: HomeArticleCard): number {
  return getEditorialFreshnessTimestamp(article);
}

/** Manual pin always wins for featured — no age expiry. */
export function isActiveTopStory(article: HomeArticleCard): boolean {
  return article.is_top_story === true;
}

export function isFeaturedCandidate(
  article: HomeArticleCard,
  nowMs: number = Date.now()
): boolean {
  const freshnessMs = getEditorialFreshnessTimestamp(article);
  if (freshnessMs <= 0) return false;
  const cutoff = nowMs - FEATURED_RECENT_DAYS * MS_PER_DAY;
  return freshnessMs >= cutoff;
}

function effectiveFeaturedTimestamp(
  article: HomeArticleCard,
  nowMs: number
): number {
  const freshness = getEditorialFreshnessTimestamp(article);
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
    getEditorialFreshnessTimestamp(b) - getEditorialFreshnessTimestamp(a);
  if (freshnessDiff !== 0) return freshnessDiff;

  return getSitePublishedTimestamp(b) - getSitePublishedTimestamp(a);
}

export function compareFeaturedCandidates(
  a: HomeArticleCard,
  b: HomeArticleCard,
  nowMs: number = Date.now()
): number {
  const scoreCmp = compareArticlesByEditorialScore(a, b, nowMs);
  if (scoreCmp !== 0) return scoreCmp;

  return (
    effectiveFeaturedTimestamp(b, nowMs) - effectiveFeaturedTimestamp(a, nowMs)
  );
}

/**
 * 오늘의 주요 기사:
 * 1) is_top_story pin (always)
 * 2) else editorial score within 7d site freshness
 */
export function pickFeaturedArticle(
  articles: HomeArticleCard[],
  nowMs: number = Date.now()
): HomeArticleCard | null {
  const activeTops = articles.filter((a) => isActiveTopStory(a));
  if (activeTops.length > 0) {
    return [...activeTops].sort(compareActiveTopStories)[0] ?? null;
  }

  const candidates = articles.filter((a) => isFeaturedCandidate(a, nowMs));
  if (candidates.length === 0) return null;
  return (
    pickDiversifiedByEditorialScore(candidates, {
      limit: 1,
      nowMs,
      sourceCap: 1,
      balanceRegions: false,
      suppressTopicClusters: true,
    })[0] ?? null
  );
}

function articleKey(article: HomeArticleCard): string {
  return article.article_id ?? article.id;
}

/**
 * Featured combo: secondary lead + numbered related list.
 * Uses editorial score + diversity; 72h then 7d surface window.
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

  const exclude = new Set<string>();
  if (featuredKey) exclude.add(featuredKey);

  const picked = pickDiversifiedByEditorialScore(recent, {
    limit: relatedLimit + 1,
    nowMs,
    sourceCap: 2,
    balanceRegions: true,
    suppressTopicClusters: true,
    excludeKeys: exclude,
  });

  const leads: HomeArticleCard[] = [];
  if (featured) leads.push(featured);
  if (picked[0]) leads.push(picked[0]);

  const leadKeys = new Set(leads.map(articleKey));
  const related = picked
    .filter((a) => !leadKeys.has(articleKey(a)))
    .slice(0, relatedLimit);

  return { leads, related };
}

/**
 * Site-wide home ordering: editorial score (importance + site freshness).
 */
export function sortHomeArticlesForDisplay(
  articles: HomeArticleCard[],
  nowMs: number = Date.now()
): HomeArticleCard[] {
  return sortArticlesByEditorialScore(articles, nowMs);
}
