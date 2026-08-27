import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import { categoryOrder } from "@/lib/koreanArticleDisplay";
import {
  compareArticlesByFreshness,
  filterArticlesForHomeSurface,
} from "./articleFreshness";
import { getArticleRegion, type ArticleRegion } from "./articleRegion";
import type {
  HomeArticleCard,
  TrendingIssue,
  TrendingIssueRelatedArticle,
} from "./types";

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

/** Only cards with a real public slug become link targets. */
export function toTrendingRelatedArticle(
  article: HomeArticleCard
): TrendingIssueRelatedArticle | null {
  const slug = article.slug?.trim();
  if (!slug) return null;
  return {
    id: article.id,
    article_id: article.article_id,
    slug,
    title: article.title,
    source: article.source,
    original_url: article.original_url ?? null,
  };
}

export function relatedArticlesFromBucket(
  items: HomeArticleCard[],
  lead: HomeArticleCard,
  nowMs: number,
  max = 3
): TrendingIssueRelatedArticle[] {
  const sorted = [...items].sort((a, b) =>
    compareArticlesByFreshness(a, b, nowMs)
  );
  const ordered = [
    lead,
    ...sorted.filter((a) => (a.article_id ?? a.id) !== (lead.article_id ?? lead.id)),
  ];
  const out: TrendingIssueRelatedArticle[] = [];
  const seen = new Set<string>();
  for (const article of ordered) {
    const related = toTrendingRelatedArticle(article);
    if (!related) continue;
    const key = related.article_id ?? related.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(related);
    if (out.length >= max) break;
  }
  return out;
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

function buildIssue(
  id: string,
  title: string,
  lead: HomeArticleCard,
  items: HomeArticleCard[],
  region: ArticleRegion,
  nowMs: number
): TrendingIssue {
  const relatedArticles = relatedArticlesFromBucket(items, lead, nowMs, 2);
  return {
    id,
    title,
    description: issueDescriptionFromArticle(lead),
    region,
    primaryArticle: relatedArticles[0] ?? toTrendingRelatedArticle(lead),
    relatedArticles,
  };
}

function pickForRegion(
  articles: HomeArticleCard[],
  region: ArticleRegion,
  max: number,
  nowMs: number
): TrendingIssue[] {
  const regionArticles = articles.filter((a) => getArticleRegion(a) === region);
  const pool = filterArticlesForHomeSurface(regionArticles, {
    nowMs,
    minCount: max,
    allowManualTopStory: false,
  });

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
    issues.push(
      buildIssue(bucket.id, bucket.title, lead, bucket.items, region, nowMs)
    );
    usedCategories.add(bucket.category);
  }

  const categoryCandidates: Array<{
    category: string;
    lead: HomeArticleCard;
    items: HomeArticleCard[];
  }> = [];

  for (const [category, items] of byCategory) {
    if (usedCategories.has(category) || !items.length) continue;
    const lead = leadByFreshness(items, nowMs);
    if (!lead) continue;
    categoryCandidates.push({ category, lead, items });
  }

  categoryCandidates.sort((a, b) => {
    const cmp = compareArticlesByFreshness(a.lead, b.lead, nowMs);
    if (cmp !== 0) return cmp;
    return categorySortIndex(a.category) - categorySortIndex(b.category);
  });

  for (const candidate of categoryCandidates) {
    if (issues.length >= max) break;

    issues.push(
      buildIssue(
        `cat:${candidate.category}:${region}`,
        issueTitleFromArticle(candidate.lead),
        candidate.lead,
        candidate.items,
        region,
        nowMs
      )
    );
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
