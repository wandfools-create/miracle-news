import { categoryOrder } from "@/lib/koreanArticleDisplay";
import { sortArticlesForCategorySection } from "@/lib/article/sourcePolicy";
import { featuredSourceConfigs, normalizeSource } from "@/lib/koreanArticleDisplay";
import { sortSourceLeadCards } from "@/lib/sourceLeadOrder";
import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import { getArticleRegion } from "./articleRegion";
import {
  pickFeaturedArticle,
  sortHomeArticlesForDisplay,
} from "./featuredSelection";
import { pickTrendingIssues } from "./pickTrendingIssues";
import { pickSidebarLatestArticles } from "./pickSidebarLatest";
import type { HomeArticleCard, HomePageSections } from "./types";

const TOP_STORIES_PER_COLUMN = 6;

export type EditionColumnLabels = {
  leftTitle: string;
  rightTitle: string;
};

export function prepareEditionHomeSections(
  articles: HomeArticleCard[],
  pageLocale: ArticleLocale,
  columnLabels: EditionColumnLabels,
  options?: { featuredPool?: HomeArticleCard[] }
): HomePageSections {
  const sorted = sortHomeArticlesForDisplay(articles);
  const featuredSorted = sortHomeArticlesForDisplay(
    options?.featuredPool ?? articles
  );
  const featured = pickFeaturedArticle(featuredSorted);
  const featuredKey = featured?.article_id ?? featured?.id;

  const pool = sorted.filter(
    (a) => (a.article_id ?? a.id) !== featuredKey && a.id !== featured?.id
  );

  const krPool = pool.filter((a) => getArticleRegion(a) === "kr");
  const usPool = pool.filter((a) => getArticleRegion(a) === "us");

  const left =
    pageLocale === "ko"
      ? krPool.slice(0, TOP_STORIES_PER_COLUMN)
      : usPool.slice(0, TOP_STORIES_PER_COLUMN);
  const right =
    pageLocale === "ko"
      ? usPool.slice(0, TOP_STORIES_PER_COLUMN)
      : krPool.slice(0, TOP_STORIES_PER_COLUMN);

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
    pageLocale
  );

  const sidebar = pickSidebarLatestArticles(sorted, 5);

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

  const trendingSorted = sortHomeArticlesForDisplay(
    options?.featuredPool ?? articles
  );
  const trendingIssues = pickTrendingIssues(trendingSorted, pageLocale);
  const hasTrending =
    trendingIssues.us.length > 0 || trendingIssues.kr.length > 0;

  return {
    featured,
    latest: [],
    topStories: {
      leftTitle: columnLabels.leftTitle,
      rightTitle: columnLabels.rightTitle,
      left,
      right,
    },
    trendingIssues: hasTrending ? trendingIssues : null,
    sidebar,
    groupedByCategory,
    visibleCategories,
    sourceLeadCards,
    activeSourceLabels,
  };
}
