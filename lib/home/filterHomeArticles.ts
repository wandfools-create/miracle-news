import {
  categoryOrder,
  featuredSourceConfigs,
  normalizeSource,
} from "@/lib/koreanArticleDisplay";
import type { HomeArticleCard } from "./types";

export type EditionListFilters = {
  source?: string | null;
  category?: string | null;
};

export function filterHomeArticles(
  articles: HomeArticleCard[],
  filters: EditionListFilters
): HomeArticleCard[] {
  const sourceKey = filters.source?.trim();
  const category = filters.category?.trim();

  return articles.filter((article) => {
    if (sourceKey && normalizeSource(article.source) !== sourceKey) {
      return false;
    }
    if (category && (article.category ?? "other") !== category) {
      return false;
    }
    return true;
  });
}

export function getEditionFilterOptions(articles: HomeArticleCard[]) {
  const sourceKeys = new Set<string>();
  const categories = new Set<string>();

  for (const article of articles) {
    sourceKeys.add(normalizeSource(article.source));
    categories.add(article.category ?? "other");
  }

  const sources = featuredSourceConfigs
    .filter((config) => sourceKeys.has(config.key))
    .map((config) => ({ key: config.key, label: config.label }));

  const categoryOptions = categoryOrder
    .filter((key) => categories.has(key))
    .map((key) => key);

  return { sources, categories: categoryOptions };
}
