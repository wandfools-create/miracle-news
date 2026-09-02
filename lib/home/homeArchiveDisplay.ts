import { normalizeSource } from "@/lib/article/normalizeSource";
import { getCategorySourceRank } from "@/lib/article/sourcePolicy";
import { getSitePublishedTimestamp } from "./articleFreshness";
import {
  compareArticlesByEditorialScore,
} from "./editorialRanking";
import type { HomeArticleCard } from "./types";

/**
 * Home category / source archive display:
 * always prefer newer Hannoon published_at. Editorial score only breaks an
 * exact timestamp tie. Does not change global editorial ranking.
 */
export function compareHomeArchiveDisplay(
  a: HomeArticleCard,
  b: HomeArticleCard,
  nowMs: number
): number {
  const ta = getSitePublishedTimestamp(a);
  const tb = getSitePublishedTimestamp(b);
  if (tb !== ta) return tb - ta;

  const scoreCmp = compareArticlesByEditorialScore(a, b, nowMs);
  if (scoreCmp !== 0) return scoreCmp;

  return tb - ta;
}

export function sortHomeArchiveDisplay(
  articles: HomeArticleCard[],
  nowMs: number
): HomeArticleCard[] {
  return [...articles].sort((a, b) => compareHomeArchiveDisplay(a, b, nowMs));
}

/**
 * Category rails: newest Hannoon publication first. Outlet preference and
 * editorial score only break an exact timestamp tie.
 */
export function sortHomeCategoryArticlesForDisplay(
  articles: HomeArticleCard[],
  category: string,
  nowMs: number
): HomeArticleCard[] {
  if (articles.length <= 1) return [...articles];

  return [...articles].sort((a, b) => {
    const ta = getSitePublishedTimestamp(a);
    const tb = getSitePublishedTimestamp(b);
    if (tb !== ta) return tb - ta;

    const rankA = getCategorySourceRank(normalizeSource(a.source), category);
    const rankB = getCategorySourceRank(normalizeSource(b.source), category);
    if (rankA !== rankB) return rankA - rankB;

    const scoreCmp = compareArticlesByEditorialScore(a, b, nowMs);
    if (scoreCmp !== 0) return scoreCmp;

    return tb - ta;
  });
}

/** Per-source lead: newest Hannoon publication, editorial only on exact tie. */
export function pickHomeSourceLeadMap(
  articles: HomeArticleCard[],
  nowMs: number
): Record<string, HomeArticleCard> {
  const ranked = sortHomeArchiveDisplay(articles, nowMs);
  const sourceLeadMap: Record<string, HomeArticleCard> = {};
  for (const article of ranked) {
    const sourceKey = normalizeSource(article.source);
    if (!sourceLeadMap[sourceKey]) {
      sourceLeadMap[sourceKey] = article;
    }
  }
  return sourceLeadMap;
}
