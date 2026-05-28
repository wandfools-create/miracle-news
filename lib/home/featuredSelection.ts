import { getSourceFeaturedSortBias } from "@/lib/article/sourcePolicy";
import { normalizeSource } from "@/lib/article/normalizeSource";
import type { HomeArticleCard } from "./types";

/** Featured hero only considers articles published within this many days. */
export const FEATURED_RECENT_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getPublishedTimestamp(article: HomeArticleCard): number {
  if (!article.published_at) return 0;
  const time = new Date(article.published_at).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function isFeaturedCandidate(
  article: HomeArticleCard,
  nowMs: number = Date.now()
): boolean {
  const publishedMs = getPublishedTimestamp(article);
  if (publishedMs <= 0) return false;
  const cutoff = nowMs - FEATURED_RECENT_DAYS * MS_PER_DAY;
  return publishedMs >= cutoff;
}

/** Newest published_at first (7-day featured / top list pool). */
function effectiveFeaturedTimestamp(article: HomeArticleCard): number {
  const published = getPublishedTimestamp(article);
  if (published <= 0) return 0;
  return published - getSourceFeaturedSortBias(normalizeSource(article.source));
}

function isManualTopStory(article: HomeArticleCard): boolean {
  return article.is_top_story === true;
}

function compareManualTopStories(
  a: HomeArticleCard,
  b: HomeArticleCard
): number {
  const orderA = a.top_story_order ?? 0;
  const orderB = b.top_story_order ?? 0;
  if (orderA !== orderB) return orderA - orderB;

  const publishedDiff = getPublishedTimestamp(b) - getPublishedTimestamp(a);
  if (publishedDiff !== 0) return publishedDiff;

  return getFallbackSortTimestamp(b) - getFallbackSortTimestamp(a);
}

export function compareFeaturedCandidates(
  a: HomeArticleCard,
  b: HomeArticleCard
): number {
  // TODO: when articles.view_count exists, sort by view_count desc, then published_at.
  return effectiveFeaturedTimestamp(b) - effectiveFeaturedTimestamp(a);
}

export function pickFeaturedArticle(
  articles: HomeArticleCard[],
  nowMs: number = Date.now()
): HomeArticleCard | null {
  const manual = articles.filter(isManualTopStory);
  if (manual.length > 0) {
    return [...manual].sort(compareManualTopStories)[0] ?? null;
  }

  const candidates = articles.filter((a) => isFeaturedCandidate(a, nowMs));
  if (candidates.length === 0) return null;
  return [...candidates].sort(compareFeaturedCandidates)[0] ?? null;
}

function getFallbackSortTimestamp(article: HomeArticleCard): number {
  const published = getPublishedTimestamp(article);
  if (published > 0) return published;
  const created = new Date(article.created_at).getTime();
  return Number.isNaN(created) ? 0 : created;
}

/**
 * Site-wide home ordering: published_at (newest first), then articles without
 * published_at at the bottom (by localization created_at).
 */
export function sortHomeArticlesForDisplay(
  articles: HomeArticleCard[]
): HomeArticleCard[] {
  const withPublished: HomeArticleCard[] = [];
  const withoutPublished: HomeArticleCard[] = [];

  for (const article of articles) {
    if (getPublishedTimestamp(article) > 0) {
      withPublished.push(article);
    } else {
      withoutPublished.push(article);
    }
  }

  withPublished.sort(
    (a, b) => getPublishedTimestamp(b) - getPublishedTimestamp(a)
  );
  withoutPublished.sort(
    (a, b) => getFallbackSortTimestamp(b) - getFallbackSortTimestamp(a)
  );

  return [...withPublished, ...withoutPublished];
}
