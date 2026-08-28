import { categoryOrder } from "@/lib/koreanArticleDisplay";
import { sortArticlesForCategorySection } from "@/lib/article/sourcePolicy";
import { featuredSourceConfigs, normalizeSource } from "@/lib/koreanArticleDisplay";
import { sortSourceLeadCards } from "@/lib/sourceLeadOrder";
import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import { getArticleRegion } from "./articleRegion";
import {
  pickFeaturedArticle,
  pickFeaturedHubArticles,
  sortHomeArticlesForDisplay,
} from "./featuredSelection";
import {
  filterHomeCoreEligible,
  pickDiversifiedByEditorialScore,
  sortArticlesByEditorialScore,
} from "./editorialRanking";
import {
  filterEventFamilyLeaders,
  withInheritedEventFamilyGrades,
} from "./eventFamilyUpdate";
import { pickTrendingIssues } from "./pickTrendingIssues";
import { pickSidebarLatestArticles } from "./pickSidebarLatest";
import { repairHomeCategory } from "@/lib/editorialPolicy/homeCategoryRepair";
import type { HomeArticleCard, HomePageSections } from "./types";

const TOP_STORIES_PER_COLUMN = 6;

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

export function prepareEditionHomeSections(
  articles: HomeArticleCard[],
  pageLocale: ArticleLocale,
  columnLabels: EditionColumnLabels,
  options?: { featuredPool?: HomeArticleCard[]; nowMs?: number }
): HomePageSections {
  const nowMs = options?.nowMs ?? Date.now();
  const featuredPool = withRepairedCategories(options?.featuredPool ?? articles);
  const allArticles = withRepairedCategories(articles);
  const corePool = filterHomeCoreEligible(featuredPool, nowMs);
  const rankingPool = filterEventFamilyLeaders(
    withInheritedEventFamilyGrades(corePool)
  );

  const featured = pickFeaturedArticle(corePool, nowMs);
  const featuredHub = pickFeaturedHubArticles(corePool, featured, { nowMs });
  const featuredKey = featured?.article_id ?? featured?.id;

  const coreExclude = new Set<string>();
  if (featuredKey) coreExclude.add(featuredKey);
  for (const a of featuredHub.leads) {
    coreExclude.add(a.article_id ?? a.id);
  }

  const pool = rankingPool.filter(
    (a) => (a.article_id ?? a.id) !== featuredKey && a.id !== featured?.id
  );

  const krPool = pool.filter((a) => getArticleRegion(a) === "kr");
  const usPool = pool.filter((a) => getArticleRegion(a) === "us");

  const pickColumn = (regionPool: HomeArticleCard[]) =>
    pickDiversifiedByEditorialScore(regionPool, {
      limit: TOP_STORIES_PER_COLUMN,
      nowMs,
      sourceCap: 2,
      balanceRegions: false,
      suppressTopicClusters: true,
      excludeKeys: coreExclude,
    });

  const left =
    pageLocale === "ko" ? pickColumn(krPool) : pickColumn(usPool);
  const right =
    pageLocale === "ko" ? pickColumn(usPool) : pickColumn(krPool);

  for (const a of [...left, ...right]) {
    coreExclude.add(a.article_id ?? a.id);
  }

  // Source leads may use full published pool (outlet archive character).
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

  // Featured + 보조 share event-family budget with 「지금 주목」 (max 2).
  const reservedCore = featuredHub.leads;
  const sidebar = pickSidebarLatestArticles(corePool, 5, nowMs, {
    excludeKeys: coreExclude,
    reservedCoreArticles: reservedCore,
  });

  // Category archive: full pool (past articles remain reachable via tabs).
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

  const trendingIssues = pickTrendingIssues(
    featuredPool,
    pageLocale,
    3,
    nowMs
  );
  const hasTrending =
    trendingIssues.us.length > 0 || trendingIssues.kr.length > 0;

  return {
    featured,
    featuredLeads: featuredHub.leads,
    featuredRelated: featuredHub.related,
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
