import {
  filterHomeCoreSurfacePool,
  homeCoreSpotlightPickOptions,
  pickDiversifiedByEditorialScore,
  sortArticlesByEditorialScore,
} from "./editorialRanking";
import type { HomeArticleCard } from "./types";

export function articleDedupeKey(article: HomeArticleCard): string {
  return article.article_id ?? article.id;
}

export type PickSidebarLatestOptions = {
  excludeKeys?: Set<string>;
  /** Featured (+ 보조) already on the core surface — event-family budget. */
  reservedCoreArticles?: HomeArticleCard[];
};

/**
 * 「지금 주목」: editorial score within 72h→7d only.
 * Shares event-family budget with featured (+ 보조): max 2 total,
 * second slot only for UPDATE / DIFFERENT ANGLE.
 * Never injects out-of-window top stories; never falls back to full archive.
 * Prefer fewer slots over filling with months-old pins.
 */
export function pickSidebarLatestArticles(
  articles: HomeArticleCard[],
  limit = 5,
  nowMs: number = Date.now(),
  options?: PickSidebarLatestOptions
): HomeArticleCard[] {
  const recent = filterHomeCoreSurfacePool(articles, {
    nowMs,
    minCount: limit,
  });
  const reserved = options?.reservedCoreArticles ?? [];
  return pickDiversifiedByEditorialScore(recent, {
    ...homeCoreSpotlightPickOptions(reserved, options?.excludeKeys),
    limit,
    nowMs,
  });
}

/** @deprecated Prefer pickDiversifiedByEditorialScore — kept for tests. */
export function sortSidebarArticlesForTests(
  articles: HomeArticleCard[],
  nowMs: number = Date.now()
): HomeArticleCard[] {
  return sortArticlesByEditorialScore(articles, nowMs);
}
