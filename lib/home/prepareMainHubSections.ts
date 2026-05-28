import { categoryOrder } from "@/lib/koreanArticleDisplay";
import {
  compareFeaturedCandidates,
  getPublishedTimestamp,
  isFeaturedCandidate,
  pickFeaturedArticle,
  sortHomeArticlesForDisplay,
} from "./featuredSelection";
import type { HomeArticleCard } from "./types";

export type MainHubSections = {
  featured: HomeArticleCard | null;
  /** Ranked stories in the 7-day window (excluding featured). */
  topStories: HomeArticleCard[];
  /** Older or out-of-window stories for a secondary feed. */
  recentFeed: HomeArticleCard[];
};

// TODO: after articles.view_count exists, wire view_count into compareFeaturedCandidates.
export function prepareMainHubSections(
  articles: HomeArticleCard[]
): MainHubSections {
  const sorted = sortHomeArticlesForDisplay(articles);
  const featured = pickFeaturedArticle(sorted);

  const windowPool = sorted.filter((a) => isFeaturedCandidate(a));
  const ranked = [...windowPool].sort(compareFeaturedCandidates);
  const featuredId = featured?.id ?? null;

  const topStories = ranked
    .filter((a) => a.id !== featuredId)
    .slice(0, 10);

  const usedIds = new Set<string>();
  if (featuredId) usedIds.add(featuredId);
  for (const a of topStories) usedIds.add(a.id);

  /** published_at 없는 기사만 하단 피드 (주요·탑 리스트 제외). */
  const recentFeed = sorted
    .filter((a) => !getPublishedTimestamp(a) && !usedIds.has(a.id))
    .slice(0, 8);

  return { featured, topStories, recentFeed };
}

export type EditionSections = {
  latestStrip: HomeArticleCard[];
  groupedByCategory: Record<string, HomeArticleCard[]>;
  visibleCategories: string[];
};

export function prepareEditionSections(
  articles: HomeArticleCard[]
): EditionSections {
  const sorted = sortHomeArticlesForDisplay(articles);
  const latestStrip = sorted.slice(0, 6);

  const groupedByCategory: Record<string, HomeArticleCard[]> = {};
  for (const article of sorted) {
    const key = article.category ?? "other";
    if (!groupedByCategory[key]) groupedByCategory[key] = [];
    groupedByCategory[key].push(article);
  }

  const visibleCategories = categoryOrder.filter(
    (category) => groupedByCategory[category]?.length
  );

  return { latestStrip, groupedByCategory, visibleCategories };
}
