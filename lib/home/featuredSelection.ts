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
import {
  filterEventFamilyLeaders,
  resolveEventFamilyLeadership,
  withInheritedEventFamilyGrades,
} from "./eventFamilyUpdate";
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

function articleKey(article: HomeArticleCard): string {
  return article.article_id ?? article.id;
}

/**
 * Core eligible pool with event-family leadership applied:
 * superseded backgrounds excluded; leaders may inherit sibling AI grades.
 */
export function prepareHomeRankingPool(
  articles: HomeArticleCard[],
  nowMs: number = Date.now()
): HomeArticleCard[] {
  const eligible = filterHomeCoreEligible(articles, nowMs);
  // Inherit from the full family (including backgrounds), then drop backgrounds.
  const withGrades = withInheritedEventFamilyGrades(eligible);
  return filterEventFamilyLeaders(withGrades);
}

/**
 * 오늘의 주요 기사: ≤7d pool → event-family UPDATE leadership → editorial rank.
 */
export function pickFeaturedArticle(
  articles: HomeArticleCard[],
  nowMs: number = Date.now()
): HomeArticleCard | null {
  const pool = prepareHomeRankingPool(articles, nowMs);
  if (pool.length === 0) return null;
  return (
    pickDiversifiedByEditorialScore(pool, {
      limit: 1,
      nowMs,
      sourceCap: 1,
      balanceRegions: false,
      suppressTopicClusters: true,
    })[0] ?? null
  );
}

/**
 * Featured combo: secondary lead + numbered related list.
 * Support prefers other families / DIFFERENT ANGLE; superseded backgrounds
 * may appear only in related as context.
 */
export function pickFeaturedHubArticles(
  articles: HomeArticleCard[],
  featured: HomeArticleCard | null,
  options?: { relatedLimit?: number; nowMs?: number }
): { leads: HomeArticleCard[]; related: HomeArticleCard[] } {
  const nowMs = options?.nowMs ?? Date.now();
  const relatedLimit = options?.relatedLimit ?? 5;
  const featuredKey = featured ? articleKey(featured) : null;

  const leadership = resolveEventFamilyLeadership(articles);
  const gradedAll = withInheritedEventFamilyGrades(articles);
  const withoutFeatured = gradedAll.filter(
    (a) => articleKey(a) !== featuredKey && a.id !== featured?.id
  );

  const leadersOnly = withoutFeatured.filter(
    (a) => !leadership.backgroundKeys.has(articleKey(a))
  );
  const backgrounds = withoutFeatured.filter((a) =>
    leadership.backgroundKeys.has(articleKey(a))
  );

  const recentLeaders = filterHomeCoreSurfacePool(leadersOnly, {
    nowMs,
    minCount: relatedLimit + 1,
  });

  const exclude = new Set<string>();
  if (featuredKey) exclude.add(featuredKey);

  const picked = pickDiversifiedByEditorialScore(recentLeaders, {
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
  const relatedFromLeaders = picked
    .filter((a) => !leadKeys.has(articleKey(a)))
    .slice(0, relatedLimit);

  const related: HomeArticleCard[] = [...relatedFromLeaders];
  if (featured && related.length < relatedLimit) {
    for (const bg of sortArticlesByEditorialScore(backgrounds, nowMs)) {
      if (related.length >= relatedLimit) break;
      if (leadKeys.has(articleKey(bg))) continue;
      related.push(bg);
    }
  }

  return { leads, related };
}

/**
 * Site-wide home ordering: editorial score (importance + site freshness).
 * Does not drop event-family backgrounds (category archive needs the full set).
 */
export function sortHomeArticlesForDisplay(
  articles: HomeArticleCard[],
  nowMs: number = Date.now()
): HomeArticleCard[] {
  return sortArticlesByEditorialScore(articles, nowMs);
}

/** Kept for tests that still reference site timestamp helpers. */
export { getSitePublishedTimestamp };
