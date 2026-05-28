import { categoryOrder } from "@/lib/koreanArticleDisplay";
import { sortArticlesForCategorySection } from "@/lib/article/sourcePolicy";
import { featuredSourceConfigs, normalizeSource } from "@/lib/koreanArticleDisplay";
import { sortSourceLeadCards } from "@/lib/sourceLeadOrder";
import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import { balanceLatestByRegion } from "./balanceLatestByRegion";
import {
  pickFeaturedArticle,
  sortHomeArticlesForDisplay,
} from "./featuredSelection";
import type { HomeArticleCard, HomePageSections } from "./types";

export type PrepareHomeSectionsOptions = {
  /** Main hub (/): interleave US & Korea ~50:50 in latest list. */
  balanceLatestByRegion?: boolean;
  latestLimit?: number;
};

export function prepareHomeSections(
  articles: HomeArticleCard[],
  locale: ArticleLocale,
  options?: PrepareHomeSectionsOptions
): HomePageSections {
  const sorted = sortHomeArticlesForDisplay(articles);
  const featured = pickFeaturedArticle(sorted);
  const featuredId = featured?.id;
  const latestLimit = options?.latestLimit ?? 8;

  const latestPool = sorted.filter((a) => a.id !== featuredId);
  const latest = options?.balanceLatestByRegion
    ? balanceLatestByRegion(latestPool, latestLimit)
    : latestPool.slice(0, latestLimit);

  const sourceLeadMap: Record<string, HomeArticleCard> = {};
  for (const article of sorted) {
    const sourceKey = normalizeSource(article.source);
    if (!sourceLeadMap[sourceKey]) {
      sourceLeadMap[sourceKey] = article;
    }
  }

  const sourceLeadCards = sortSourceLeadCards(
    featuredSourceConfigs
      .map((config) => {
        const article = sourceLeadMap[config.key];
        if (!article) return null;
        return {
          key: config.key,
          label: config.label,
          description: config.description,
          article,
        };
      })
      .filter(Boolean) as HomePageSections["sourceLeadCards"],
    locale
  );

  const excludedIds = new Set(sourceLeadCards.map((item) => item.article.id));
  if (featuredId) excludedIds.add(featuredId);

  const sidebarBase = sorted.filter((a) => !excludedIds.has(a.id));
  const sidebar =
    sidebarBase.length > 0 ? sidebarBase.slice(0, 5) : sorted.slice(0, 5);

  const groupedByCategory: Record<string, HomeArticleCard[]> = {};
  for (const article of sorted) {
    const key = article.category ?? "other";
    if (!groupedByCategory[key]) groupedByCategory[key] = [];
    groupedByCategory[key].push(article);
  }
  for (const key of Object.keys(groupedByCategory)) {
    groupedByCategory[key] = sortArticlesForCategorySection(
      groupedByCategory[key],
      key
    );
  }

  const visibleCategories = categoryOrder.filter(
    (category) => groupedByCategory[category]?.length
  );

  const activeSourceLabels = featuredSourceConfigs
    .filter((config) => Boolean(sourceLeadMap[config.key]))
    .map((config) => config.label);

  return {
    featured,
    latest,
    sidebar,
    groupedByCategory,
    visibleCategories,
    sourceLeadCards,
    activeSourceLabels,
  };
}
