import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import { categoryOrder } from "@/lib/koreanArticleDisplay";
import { compareArticlesByFreshness } from "./articleFreshness";
import { getArticleRegion, type ArticleRegion } from "./articleRegion";
import type { HomeArticleCard, TrendingIssue } from "./types";

function truncateText(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  const cut = oneLine.slice(0, max - 1).trim();
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > max * 0.45) return `${cut.slice(0, lastSpace)}…`;
  return `${cut}…`;
}

export function issueTitleFromArticle(
  article: HomeArticleCard,
  topicLabel?: string
): string {
  if (topicLabel) return topicLabel;
  const title = article.title.trim().replace(/\s+/g, " ").replace(/#\S+/g, "").trim();
  return truncateText(title, 72);
}

export function issueDescriptionFromArticle(
  article: HomeArticleCard
): string | null {
  const summary = article.summary?.trim();
  if (!summary) return null;
  return truncateText(summary, 96);
}

type IssueBucket = {
  id: string;
  title: string;
  category: string;
  items: HomeArticleCard[];
};

function categorySortIndex(category: string): number {
  const index = categoryOrder.indexOf(
    category as (typeof categoryOrder)[number]
  );
  return index === -1 ? categoryOrder.length : index;
}

function leadByFreshness(
  items: HomeArticleCard[],
  nowMs: number
): HomeArticleCard | null {
  if (!items.length) return null;
  return [...items].sort((a, b) => compareArticlesByFreshness(a, b, nowMs))[0] ?? null;
}

function pickForRegion(
  articles: HomeArticleCard[],
  region: ArticleRegion,
  max: number,
  nowMs: number
): TrendingIssue[] {
  const pool = articles.filter((a) => getArticleRegion(a) === region);

  const topicBuckets = new Map<string, IssueBucket>();
  const byCategory = new Map<string, HomeArticleCard[]>();

  for (const article of pool) {
    const category = article.category ?? "other";
    const topicKey = article.topic_key?.trim();
    const topicLabel = article.topic_label?.trim();

    if (topicKey && topicLabel) {
      const id = `topic:${topicKey}`;
      const existing = topicBuckets.get(id) ?? {
        id,
        title: topicLabel,
        category,
        items: [],
      };
      existing.items.push(article);
      topicBuckets.set(id, existing);
    } else {
      const list = byCategory.get(category) ?? [];
      list.push(article);
      byCategory.set(category, list);
    }
  }

  const issues: TrendingIssue[] = [];
  const usedCategories = new Set<string>();

  const topicSorted = [...topicBuckets.values()].sort((a, b) => {
    const leadA = leadByFreshness(a.items, nowMs);
    const leadB = leadByFreshness(b.items, nowMs);
    if (!leadA || !leadB) return 0;
    return compareArticlesByFreshness(leadA, leadB, nowMs);
  });

  for (const bucket of topicSorted) {
    if (issues.length >= max) break;
    const lead = leadByFreshness(bucket.items, nowMs);
    if (!lead) continue;
    issues.push({
      id: bucket.id,
      title: bucket.title,
      description: issueDescriptionFromArticle(lead),
      region,
    });
    usedCategories.add(bucket.category);
  }

  const categoryCandidates: Array<{
    category: string;
    lead: HomeArticleCard;
  }> = [];

  for (const [category, items] of byCategory) {
    if (usedCategories.has(category) || !items.length) continue;
    const lead = leadByFreshness(items, nowMs);
    if (!lead) continue;
    categoryCandidates.push({ category, lead });
  }

  categoryCandidates.sort((a, b) => {
    const cmp = compareArticlesByFreshness(a.lead, b.lead, nowMs);
    if (cmp !== 0) return cmp;
    return categorySortIndex(a.category) - categorySortIndex(b.category);
  });

  for (const candidate of categoryCandidates) {
    if (issues.length >= max) break;

    issues.push({
      id: `cat:${candidate.category}:${region}`,
      title: issueTitleFromArticle(candidate.lead),
      description: issueDescriptionFromArticle(candidate.lead),
      region,
    });
  }

  return issues;
}

export function pickTrendingIssues(
  articles: HomeArticleCard[],
  _pageLocale: ArticleLocale,
  maxPerRegion = 3,
  nowMs: number = Date.now()
): { us: TrendingIssue[]; kr: TrendingIssue[] } {
  return {
    us: pickForRegion(articles, "us", maxPerRegion, nowMs),
    kr: pickForRegion(articles, "kr", maxPerRegion, nowMs),
  };
}
