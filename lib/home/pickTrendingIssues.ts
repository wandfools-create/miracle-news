import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import { getArticleRegion, type ArticleRegion } from "./articleRegion";
import type { HomeArticleCard, TrendingIssue } from "./types";

const FOCUS_CATEGORIES = ["politics", "society", "economy"] as const;

function publishedTimestamp(article: HomeArticleCard): number {
  const raw = article.published_at ?? article.created_at;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

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

function pickForRegion(
  articles: HomeArticleCard[],
  region: ArticleRegion,
  max: number
): TrendingIssue[] {
  const pool = articles.filter(
    (a) =>
      getArticleRegion(a) === region &&
      FOCUS_CATEGORIES.includes(
        (a.category ?? "other") as (typeof FOCUS_CATEGORIES)[number]
      )
  );

  const topicBuckets = new Map<string, IssueBucket>();
  const byCategory = new Map<string, HomeArticleCard[]>();

  for (const article of pool) {
    const category = article.category ?? "other";
    if (!FOCUS_CATEGORIES.includes(category as (typeof FOCUS_CATEGORIES)[number])) {
      continue;
    }

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
    const newestA = Math.max(...a.items.map(publishedTimestamp));
    const newestB = Math.max(...b.items.map(publishedTimestamp));
    return newestB - newestA;
  });

  for (const bucket of topicSorted) {
    if (issues.length >= max) break;
    const sorted = [...bucket.items].sort(
      (a, b) => publishedTimestamp(b) - publishedTimestamp(a)
    );
    const lead = sorted[0];
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
    newestTs: number;
  }> = [];

  for (const category of FOCUS_CATEGORIES) {
    if (usedCategories.has(category)) continue;

    const items = byCategory.get(category);
    if (!items?.length) continue;

    const sorted = [...items].sort(
      (a, b) => publishedTimestamp(b) - publishedTimestamp(a)
    );
    const lead = sorted[0];
    if (!lead) continue;

    categoryCandidates.push({
      category,
      lead,
      newestTs: publishedTimestamp(lead),
    });
  }

  categoryCandidates.sort((a, b) => b.newestTs - a.newestTs);

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
  maxPerRegion = 3
): { us: TrendingIssue[]; kr: TrendingIssue[] } {
  return {
    us: pickForRegion(articles, "us", maxPerRegion),
    kr: pickForRegion(articles, "kr", maxPerRegion),
  };
}
