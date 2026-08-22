import {
  filterArticlesForHomeSurface,
  sortArticlesByFreshness,
} from "./articleFreshness";
import type { HomeArticleCard } from "./types";

export function articleDedupeKey(article: HomeArticleCard): string {
  return article.article_id ?? article.id;
}

/**
 * 「지금 주목」: prefer last 72h by source freshness, fall back to 7d.
 * Older than 7d excluded (manual is_top_story still allowed).
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
  const sorted = sortArticlesByFreshness(recent, nowMs);
  const seen = new Set<string>();
  const result: HomeArticleCard[] = [];

  for (const article of sorted) {
    const key = articleDedupeKey(article);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(article);
    if (result.length >= limit) break;
  }

  return result;
}
