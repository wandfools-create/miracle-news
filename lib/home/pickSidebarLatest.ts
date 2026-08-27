import {
  filterHomeCoreSurfacePool,
  pickDiversifiedByEditorialScore,
  sortArticlesByEditorialScore,
} from "./editorialRanking";
import type { HomeArticleCard } from "./types";

export function articleDedupeKey(article: HomeArticleCard): string {
  return article.article_id ?? article.id;
}

/**
 * 「지금 주목」: editorial score within 72h→7d only.
 * Never injects out-of-window top stories; never falls back to full archive.
 * Prefer fewer slots over filling with months-old pins.
 */
export function pickSidebarLatestArticles(
  articles: HomeArticleCard[],
  limit = 5,
  nowMs: number = Date.now()
): HomeArticleCard[] {
  const recent = filterHomeCoreSurfacePool(articles, {
    nowMs,
    minCount: limit,
  });
  return pickDiversifiedByEditorialScore(recent, {
    limit,
    nowMs,
    sourceCap: 2,
    balanceRegions: true,
    suppressTopicClusters: true,
  });
}

/** @deprecated Prefer pickDiversifiedByEditorialScore — kept for tests. */
export function sortSidebarArticlesForTests(
  articles: HomeArticleCard[],
  nowMs: number = Date.now()
): HomeArticleCard[] {
  return sortArticlesByEditorialScore(articles, nowMs);
}
