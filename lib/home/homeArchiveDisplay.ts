import { normalizeSource } from "@/lib/article/normalizeSource";
import { getCategorySourceRank } from "@/lib/article/sourcePolicy";
import { formatAmericaNewYorkDateKey } from "@/lib/cron/americaNewYork";
import { getSitePublishedTimestamp } from "./articleFreshness";
import {
  compareArticlesByEditorialScore,
} from "./editorialRanking";
import type { HomeArticleCard } from "./types";

/** Within the same NY publish day, timestamps closer than this may use editorial tie-break. */
export const HOME_ARCHIVE_EDITORIAL_TIEBREAK_MS = 60 * 60 * 1000;

function sitePublishNyDateKey(article: HomeArticleCard): string {
  return formatAmericaNewYorkDateKey(article.published_at ?? "");
}

/**
 * Home category / source archive display:
 * prefer newer site published_at (NY day first, then clock), and only use
 * editorial score as a near-tie break. Does not change global editorial ranking.
 */
export function compareHomeArchiveDisplay(
  a: HomeArticleCard,
  b: HomeArticleCard,
  nowMs: number
): number {
  const dayA = sitePublishNyDateKey(a);
  const dayB = sitePublishNyDateKey(b);
  if (dayA && dayB && dayA !== dayB) {
    return dayB.localeCompare(dayA);
  }

  const ta = getSitePublishedTimestamp(a);
  const tb = getSitePublishedTimestamp(b);
  if (ta > 0 && tb > 0 && Math.abs(tb - ta) > HOME_ARCHIVE_EDITORIAL_TIEBREAK_MS) {
    return tb - ta;
  }

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
 * Category rails: newer publish day / clock first. Outlet preference and
 * editorial score apply only inside the near-tie window.
 */
export function sortHomeCategoryArticlesForDisplay(
  articles: HomeArticleCard[],
  category: string,
  nowMs: number
): HomeArticleCard[] {
  if (articles.length <= 1) return [...articles];

  return [...articles].sort((a, b) => {
    const dayA = sitePublishNyDateKey(a);
    const dayB = sitePublishNyDateKey(b);
    if (dayA && dayB && dayA !== dayB) {
      return dayB.localeCompare(dayA);
    }

    const ta = getSitePublishedTimestamp(a);
    const tb = getSitePublishedTimestamp(b);
    if (ta > 0 && tb > 0 && Math.abs(tb - ta) > HOME_ARCHIVE_EDITORIAL_TIEBREAK_MS) {
      return tb - ta;
    }

    const rankA = getCategorySourceRank(normalizeSource(a.source), category);
    const rankB = getCategorySourceRank(normalizeSource(b.source), category);
    if (rankA !== rankB) return rankA - rankB;

    const scoreCmp = compareArticlesByEditorialScore(a, b, nowMs);
    if (scoreCmp !== 0) return scoreCmp;

    return tb - ta;
  });
}

/** Per-source lead: newest site-publish day/clock, editorial only near-tie. */
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
