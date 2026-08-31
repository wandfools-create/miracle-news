import { normalizeSource } from "@/lib/article/normalizeSource";
import { getPublishedTimestamp } from "@/lib/home/featuredSelection";
import type { HomeArticleCard } from "./types";

export function filterArticlesBySourceKey(
  articles: HomeArticleCard[],
  sourceKey: string
): HomeArticleCard[] {
  const key = normalizeSource(sourceKey);
  return articles.filter((a) => normalizeSource(a.source) === key);
}

export function filterArticlesByCategoryKey(
  articles: HomeArticleCard[],
  categoryKey: string
): HomeArticleCard[] {
  const key = (categoryKey || "other").trim().toLowerCase();
  return articles.filter((a) => (a.category ?? "other").toLowerCase() === key);
}

export function sortHomeFilterResults(
  articles: HomeArticleCard[]
): HomeArticleCard[] {
  const seen = new Set<string>();
  const out: HomeArticleCard[] = [];
  const sorted = [...articles].sort(
    (a, b) => getPublishedTimestamp(b) - getPublishedTimestamp(a)
  );
  for (const article of sorted) {
    const key = article.article_id ?? article.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(article);
  }
  return out;
}

export const HOME_FILTER_RESULT_LIMIT = 48;

export function buildHomeFilterResults(
  articles: HomeArticleCard[],
  filters: { sourceKey?: string | null; categoryKey?: string | null }
): HomeArticleCard[] {
  let pool = articles;
  if (filters.sourceKey) {
    pool = filterArticlesBySourceKey(pool, filters.sourceKey);
  }
  if (filters.categoryKey) {
    pool = filterArticlesByCategoryKey(pool, filters.categoryKey);
  }
  return sortHomeFilterResults(pool).slice(0, HOME_FILTER_RESULT_LIMIT);
}
