import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import {
  pickFeaturedArticle,
  pickFeaturedHubArticles,
} from "./featuredSelection";
import { filterHomeCoreEligible } from "./editorialRanking";
import {
  getArticleSitePublishNyDateKey,
  getEditionDateKey,
} from "./todayEdition";
import type { HomeArticleCard } from "./types";

export type PreviousEditionFeatured = {
  editionDateKey: string;
  featured: HomeArticleCard | null;
  secondaryFeatured: HomeArticleCard | null;
  featuredRelated: HomeArticleCard[];
};

/** Most recent NY edition before today that has published articles. */
export function findLatestPriorEditionDateKey(
  articles: HomeArticleCard[],
  editionDateKey: string
): string | null {
  const keys = new Set<string>();
  for (const article of articles) {
    const key = getArticleSitePublishNyDateKey(article);
    if (!key || key >= editionDateKey) continue;
    keys.add(key);
  }
  if (keys.size === 0) return null;
  return [...keys].sort((a, b) => b.localeCompare(a))[0] ?? null;
}

export function articlesForEditionDateKey(
  articles: HomeArticleCard[],
  dateKey: string
): HomeArticleCard[] {
  return articles.filter(
    (a) => getArticleSitePublishNyDateKey(a) === dateKey
  );
}

/**
 * When today has no stories, keep the prior edition lead using the same
 * featured selection policy (not plain latest sort).
 */
export function pickPreviousEditionFeatured(
  articles: HomeArticleCard[],
  options?: { nowMs?: number; locale?: ArticleLocale }
): PreviousEditionFeatured | null {
  const nowMs = options?.nowMs ?? Date.now();
  const editionDateKey = getEditionDateKey(nowMs);
  const priorKey = findLatestPriorEditionDateKey(articles, editionDateKey);
  if (!priorKey) return null;

  const editionArticles = articlesForEditionDateKey(articles, priorKey);
  const core = filterHomeCoreEligible(editionArticles, nowMs);
  const featured = pickFeaturedArticle(core, nowMs);
  if (!featured) return null;

  let secondaryFeatured: HomeArticleCard | null = null;
  let featuredRelated: HomeArticleCard[] = [];
  if (editionArticles.length >= 2) {
    const hub = pickFeaturedHubArticles(core, featured, { nowMs });
    secondaryFeatured = hub.leads[1] ?? null;
    featuredRelated = hub.related;
  }

  return {
    editionDateKey: priorKey,
    featured,
    secondaryFeatured,
    featuredRelated,
  };
}
