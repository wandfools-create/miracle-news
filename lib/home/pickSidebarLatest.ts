import { sortHomeArticlesForDisplay } from "./featuredSelection";
import type { HomeArticleCard } from "./types";

export function articleDedupeKey(article: HomeArticleCard): string {
  return article.article_id ?? article.id;
}

/** Latest published articles for sidebar — dedupe only, no featured/source exclusions. */
export function pickSidebarLatestArticles(
  articles: HomeArticleCard[],
  limit = 5
): HomeArticleCard[] {
  const sorted = sortHomeArticlesForDisplay(articles);
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
