import { categoryOrder } from "@/lib/koreanArticleDisplay";
import { sortArticlesForCategorySection } from "@/lib/article/sourcePolicy";
import { featuredSourceConfigs, normalizeSource } from "@/lib/koreanArticleDisplay";
import { sortSourceLeadCards } from "@/lib/sourceLeadOrder";
import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import { sortHomeArticlesForDisplay } from "./featuredSelection";
import {
  sortArticlesByEditorialScore,
} from "./editorialRanking";
import {
  buildTodayEdition,
  pickTodayTopStoriesColumns,
} from "./todayEdition";
import { repairHomeCategory } from "@/lib/editorialPolicy/homeCategoryRepair";
import type { HomeArticleCard, HomePageSections } from "./types";

export type EditionColumnLabels = {
  leftTitle: string;
  rightTitle: string;
};

function withRepairedCategories(articles: HomeArticleCard[]): HomeArticleCard[] {
  return articles.map((article) => {
    const next = repairHomeCategory({
      category: article.category,
      title: article.title,
      summary: article.summary,
      source: article.source,
    });
    if (next === (article.category ?? "other")) return article;
    return { ...article, category: next };
  });
}

function articleKey(article: HomeArticleCard): string {
  return article.article_id ?? article.id;
}

export function prepareEditionHomeSections(
  articles: HomeArticleCard[],
  pageLocale: ArticleLocale,
  columnLabels: EditionColumnLabels,
  options?: { featuredPool?: HomeArticleCard[]; nowMs?: number }
): HomePageSections {
  const nowMs = options?.nowMs ?? Date.now();
  const allArticles = withRepairedCategories(articles);

  const todayEdition = buildTodayEdition(allArticles, { nowMs, locale: pageLocale });

  const featured = todayEdition.featured;
  const secondaryFeatured = todayEdition.secondaryFeatured;

  let featuredLeads: HomeArticleCard[] = [];
  let featuredRelated: HomeArticleCard[] = [];

  if (featured && todayEdition.status !== "preparing") {
    featuredLeads = [featured];
    if (secondaryFeatured) {
      featuredLeads.push(secondaryFeatured);
    }
    featuredRelated = todayEdition.featuredRelated;
  }

  const featuredExclude = new Set<string>();
  for (const a of featuredLeads) featuredExclude.add(articleKey(a));
  for (const a of featuredRelated) featuredExclude.add(articleKey(a));

  const topStories = pickTodayTopStoriesColumns(
    todayEdition.todayArticles,
    pageLocale,
    columnLabels,
    nowMs,
    { excludeKeys: featuredExclude }
  );

  const sourceLeadMap: Record<string, HomeArticleCard> = {};
  for (const article of sortArticlesByEditorialScore(allArticles, nowMs)) {
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
    pageLocale
  );

  const groupedByCategory: Record<string, HomeArticleCard[]> = {};
  for (const article of sortHomeArticlesForDisplay(allArticles, nowMs)) {
    const key = article.category ?? "other";
    if (!groupedByCategory[key]) groupedByCategory[key] = [];
    groupedByCategory[key].push(article);
  }
  for (const key of Object.keys(groupedByCategory)) {
    const scored = sortArticlesByEditorialScore(
      groupedByCategory[key],
      nowMs
    );
    groupedByCategory[key] = sortArticlesForCategorySection(scored, key);
  }

  const visibleCategories = categoryOrder.filter(
    (category) => groupedByCategory[category]?.length
  );

  const activeSourceLabels = featuredSourceConfigs
    .filter((config) => Boolean(sourceLeadMap[config.key]))
    .map((config) => config.label);

  const {
    spotlight: sidebar,
    trending: trendingIssues,
    previousHighlights,
    editionDateKey,
    todayCount,
    lastUpdatedAt,
    status,
    headerDateKo,
    headerDateEn,
    editionTitleKo,
    editionTitleEn,
    statusLineKo,
    statusLineEn,
    preparingMessageKo,
    preparingMessageEn,
    preparingPhaseKo,
    preparingPhaseEn,
  } = todayEdition;

  return {
    featured,
    featuredLeads,
    featuredRelated,
    latest: [],
    topStories,
    trendingIssues,
    sidebar,
    previousHighlights,
    todayEdition: {
      editionDateKey,
      todayCount,
      lastUpdatedAt,
      status,
      headerDateKo,
      headerDateEn,
      editionTitleKo,
      editionTitleEn,
      statusLineKo,
      statusLineEn,
      preparingMessageKo,
      preparingMessageEn,
      preparingPhaseKo,
      preparingPhaseEn,
    },
    groupedByCategory,
    visibleCategories,
    sourceLeadCards,
    activeSourceLabels,
  };
}
