import { normalizeSource } from "@/lib/article/normalizeSource";
import {
  EXCLUDED_RECOMMENDATION_SOURCE_KEYS,
  PRIMARY_FOREIGN_SOURCE_KEYS,
} from "@/lib/article/sourceConstants";
import type { HomeArticleCard } from "@/lib/home/types";

export {
  EXCLUDED_RECOMMENDATION_SOURCE_KEYS,
  PRIMARY_FOREIGN_SOURCE_KEYS,
  PRIMARY_KOREAN_SOURCE_KEYS,
  type PrimaryForeignSourceKey,
  type PrimaryKoreanSourceKey,
} from "@/lib/article/sourceConstants";

const WORLD_RELIGION_SOURCE_RANK: Record<string, number> = {
  csm: 0,
  ap: 1,
  "pbs-newshour": 2,
  cnn: 3,
  "fox-news": 4,
  reuters: 90,
  chosun: 40,
  joongang: 40,
  tvchosun: 40,
  insight: 40,
};

const CATEGORY_SOURCE_PRIORITY = new Set(["world", "religion"]);

function getPublishedTimestamp(article: HomeArticleCard): number {
  if (!article.published_at) return 0;
  const time = new Date(article.published_at).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function isExcludedFromRecommendations(sourceKey: string): boolean {
  return EXCLUDED_RECOMMENDATION_SOURCE_KEYS.has(sourceKey);
}

export function isPrimaryForeignSource(sourceKey: string): boolean {
  return (PRIMARY_FOREIGN_SOURCE_KEYS as readonly string[]).includes(sourceKey);
}

export function getSourceFeaturedSortBias(sourceKey: string): number {
  return isExcludedFromRecommendations(sourceKey) ? 12 * 60 * 60 * 1000 : 0;
}

export function getCategorySourceRank(
  sourceKey: string,
  category: string
): number {
  if (!CATEGORY_SOURCE_PRIORITY.has(category)) {
    return isExcludedFromRecommendations(sourceKey) ? 90 : 50;
  }
  return WORLD_RELIGION_SOURCE_RANK[sourceKey] ?? 55;
}

/**
 * Within 국제/종교 sections, prefer CSM and other primary foreign outlets,
 * then recency. Other categories keep input order (already date-sorted).
 */
export function sortArticlesForCategorySection(
  articles: HomeArticleCard[],
  category: string
): HomeArticleCard[] {
  if (!CATEGORY_SOURCE_PRIORITY.has(category) || articles.length <= 1) {
    return articles;
  }

  return [...articles].sort((a, b) => {
    const keyA = normalizeSource(a.source);
    const keyB = normalizeSource(b.source);
    const rankA = getCategorySourceRank(keyA, category);
    const rankB = getCategorySourceRank(keyB, category);
    if (rankA !== rankB) return rankA - rankB;

    return getPublishedTimestamp(b) - getPublishedTimestamp(a);
  });
}
