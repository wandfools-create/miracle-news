import { sortArticlesForCategorySection } from "@/lib/article/sourcePolicy";
import {
  categoryOrder,
  featuredSourceConfigs,
  normalizeSource,
} from "@/lib/koreanArticleDisplay";
import { getArticleRegion, isSourceKeyForRegion } from "./articleRegion";
import {
  pickFeaturedArticle,
  sortHomeArticlesForDisplay,
} from "./featuredSelection";
import { isSocialMediaArticle } from "./socialSource";
import type { MainHubColumnSections, MainHubSplitSections } from "./mainHubSplitTypes";
import type { ArticleRegion } from "./articleRegion";
import type { HomeArticleCard, SourceLeadCard } from "./types";

const LATEST_PER_COLUMN = 6;
const SOCIAL_PER_COLUMN = 4;
const CATEGORY_SLICE = 3;

function buildColumnSections(
  pool: HomeArticleCard[],
  socialPool: HomeArticleCard[],
  region: ArticleRegion
): MainHubColumnSections {
  const sorted = sortHomeArticlesForDisplay(pool);
  const featured =
    pickFeaturedArticle(sorted) ?? sorted.find((a) => a.published_at) ?? sorted[0] ?? null;
  const featuredId = featured?.id ?? null;

  const latest = sorted
    .filter((a) => a.id !== featuredId)
    .slice(0, LATEST_PER_COLUMN);

  const sourceLeadMap: Record<string, HomeArticleCard> = {};
  for (const article of sorted) {
    const sourceKey = normalizeSource(article.source);
    if (!isSourceKeyForRegion(sourceKey, region)) continue;
    if (!sourceLeadMap[sourceKey]) {
      sourceLeadMap[sourceKey] = article;
    }
  }

  const sourceLeadCards: SourceLeadCard[] = featuredSourceConfigs
    .filter((config) => isSourceKeyForRegion(config.key, region))
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
    .filter(Boolean) as SourceLeadCard[];

  const usedInSources = new Set(sourceLeadCards.map((c) => c.article.id));
  const groupedByCategory: Record<string, HomeArticleCard[]> = {};
  for (const article of sorted) {
    if (article.id === featuredId) continue;
    if (usedInSources.has(article.id)) continue;
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

  const socialArticles = sortHomeArticlesForDisplay(socialPool).slice(
    0,
    SOCIAL_PER_COLUMN
  );

  return {
    region,
    featured,
    latest,
    sourceLeadCards,
    groupedByCategory,
    visibleCategories,
    socialArticles,
  };
}

export function prepareMainHubSplitSections(
  articles: HomeArticleCard[]
): MainHubSplitSections {
  const sorted = sortHomeArticlesForDisplay(articles);
  const social = sorted.filter(isSocialMediaArticle);
  const conventional = sorted.filter((a) => !isSocialMediaArticle(a));

  const usPool = conventional.filter((a) => getArticleRegion(a) === "us");
  const krPool = conventional.filter((a) => getArticleRegion(a) === "kr");
  const usSocial = social.filter((a) => getArticleRegion(a) === "us");
  const krSocial = social.filter((a) => getArticleRegion(a) === "kr");

  return {
    us: buildColumnSections(usPool, usSocial, "us"),
    kr: buildColumnSections(krPool, krSocial, "kr"),
  };
}

export { CATEGORY_SLICE };
