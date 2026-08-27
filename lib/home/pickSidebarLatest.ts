import {
  filterArticlesForHomeSurface,
} from "./articleFreshness";
import {
  pickDiversifiedByEditorialScore,
  sortArticlesByEditorialScore,
} from "./editorialRanking";
import type { HomeArticleCard } from "./types";

export function articleDedupeKey(article: HomeArticleCard): string {
  return article.article_id ?? article.id;
}

/**
 * 「지금 주목」: editorial score within 72h→7d surface window, with diversity.
 * Falls back to score-sorted full pool so the section still renders.
 */
export function pickSidebarLatestArticles(
  articles: HomeArticleCard[],
  limit = 5,
  nowMs: number = Date.now()
): HomeArticleCard[] {
  const recent = filterArticlesForHomeSurface(articles, {
    nowMs,
    minCount: limit,
    allowManualTopStory: true,
  });
  const fromWindow = pickDiversifiedByEditorialScore(recent, {
    limit,
    nowMs,
    sourceCap: 2,
    balanceRegions: true,
    suppressTopicClusters: true,
  });
  if (fromWindow.length > 0) return fromWindow;

  return pickDiversifiedByEditorialScore(articles, {
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
