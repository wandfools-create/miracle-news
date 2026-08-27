import {
  filterArticlesForHomeSurface,
  sortArticlesByFreshness,
} from "./articleFreshness";
import type { HomeArticleCard } from "./types";

export function articleDedupeKey(article: HomeArticleCard): string {
  return article.article_id ?? article.id;
}

function takeUnique(
  articles: HomeArticleCard[],
  limit: number
): HomeArticleCard[] {
  const seen = new Set<string>();
  const result: HomeArticleCard[] = [];
  for (const article of articles) {
    const key = articleDedupeKey(article);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(article);
    if (result.length >= limit) break;
  }
  return result;
}

/**
 * 「지금 주목」: prefer last 72h by source freshness, fall back to 7d.
 * If the freshness windows are empty (missing timestamps / very old pool),
 * fall back to the newest published cards so the section still renders.
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
  const fromWindow = takeUnique(sortArticlesByFreshness(recent, nowMs), limit);
  if (fromWindow.length > 0) return fromWindow;

  // Guaranteed fill from published home cards when surface windows yield nothing.
  return takeUnique(sortArticlesByFreshness(articles, nowMs), limit);
}
