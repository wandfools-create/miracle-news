import { getSourceFeaturedSortBias } from "@/lib/article/sourcePolicy";
import { normalizeSource } from "@/lib/article/normalizeSource";
import { getSitePublishedTimestamp } from "./articleFreshness";
import {
  compareArticlesByEditorialScore,
  filterHomeCoreEligible,
  filterHomeCoreSurfacePool,
  getEditorialFreshnessTimestamp,
  HOME_CORE_EVENT_FAMILY_MAX,
  isForceTopStoryPin,
  pickDiversifiedByEditorialScore,
  sortArticlesByEditorialScore,
} from "./editorialRanking";
import type { HomeArticleCard } from "./types";

/** Featured / core rails: max site-publish age (days). */
export const FEATURED_RECENT_DAYS = 7;

/** @deprecated Prefer getEditorialFreshnessTimestamp for ranking. */
export function getPublishedTimestamp(article: HomeArticleCard): number {
  return getEditorialFreshnessTimestamp(article);
}

/**
 * Active featured pin: is_top_story with site published_at within 72h.
 * Older pins are not forced into featured.
 */
export function isActiveTopStory(
  article: HomeArticleCard,
  nowMs: number = Date.now()
): boolean {
  return isForceTopStoryPin(article, nowMs);
}

export function isFeaturedCandidate(
  article: HomeArticleCard,
  nowMs: number = Date.now()
): boolean {
  return filterHomeCoreEligible([article], nowMs).length > 0;
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
 * 오늘의 주요 기사: build ≤7d eligible pool first, then editorial rank
 * (72h top-story force boost → manual → AI → auto → freshness).
 */
export function pickFeaturedArticle(
  articles: HomeArticleCard[],
  nowMs: number = Date.now()
): HomeArticleCard | null {
  const eligible = filterHomeCoreEligible(articles, nowMs);
  if (eligible.length === 0) return null;
  return (
    pickDiversifiedByEditorialScore(eligible, {
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
 * 72h then 7d surface window — never past 7d, no stale pin inject.
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

  const recent = filterHomeCoreSurfacePool(withoutFeatured, {
    nowMs,
    minCount: relatedLimit + 1,
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
    reservedCoreArticles: featured ? [featured] : [],
    maxPerEventFamily: HOME_CORE_EVENT_FAMILY_MAX,
    requireDistinctAngleForSecond: true,
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

/** Kept for tests that still reference site timestamp helpers. */
export { getSitePublishedTimestamp };
