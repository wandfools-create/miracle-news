import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import { categoryOrder } from "@/lib/koreanArticleDisplay";
import { filterArticlesForHomeSurface } from "./articleFreshness";
import {
  compareArticlesByEditorialScore,
  computeEditorialScore,
  FRESHNESS_MAX_POINTS,
  getEditorialFreshnessTimestamp,
  sortArticlesByEditorialScore,
} from "./editorialRanking";
import { getArticleRegion, type ArticleRegion } from "./articleRegion";
import { normalizeTopicClusterKey } from "./topicClusterKey";
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
    locale: article.locale,
  };
}

export function relatedArticlesFromBucket(
  items: HomeArticleCard[],
  lead: HomeArticleCard,
  nowMs: number,
  max = 3
): TrendingIssueRelatedArticle[] {
  const sorted = sortArticlesByEditorialScore(items, nowMs);
  const ordered = [
    lead,
    ...sorted.filter(
      (a) => (a.article_id ?? a.id) !== (lead.article_id ?? lead.id)
    ),
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

function leadByEditorialScore(
  items: HomeArticleCard[],
  nowMs: number
): HomeArticleCard | null {
  if (!items.length) return null;

  const byScore = sortArticlesByEditorialScore(items, nowMs);
  const lead = byScore[0] ?? null;
  if (!lead || items.length === 1) return lead;

  const freshest = [...items].sort(
    (a, b) =>
      getEditorialFreshnessTimestamp(b) - getEditorialFreshnessTimestamp(a)
  )[0];
  if (!freshest || (freshest.article_id ?? freshest.id) === (lead.article_id ?? lead.id)) {
    return lead;
  }

  const leadScore = computeEditorialScore(lead, nowMs).total;
  const freshScore = computeEditorialScore(freshest, nowMs).total;
  const leadFresh = getEditorialFreshnessTimestamp(lead);
  const freshTs = getEditorialFreshnessTimestamp(freshest);
  // Prefer a meaningfully newer update when its score is close (within freshness band).
  if (
    freshTs > leadFresh &&
    freshScore >= leadScore - FRESHNESS_MAX_POINTS &&
    freshScore > 0
  ) {
    return freshest;
  }
  return lead;
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
    const cluster = normalizeTopicClusterKey({
      topic_key: article.topic_key,
      topic_label: article.topic_label,
      title: article.title,
    });
    const topicLabel = article.topic_label?.trim();

    if (cluster) {
      const id = `topic:${cluster}`;
      const existing = topicBuckets.get(id) ?? {
        id,
        title: topicLabel || issueTitleFromArticle(article),
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
    const leadA = leadByEditorialScore(a.items, nowMs);
    const leadB = leadByEditorialScore(b.items, nowMs);
    if (!leadA || !leadB) return 0;
    return compareArticlesByEditorialScore(leadA, leadB, nowMs);
  });

  for (const bucket of topicSorted) {
    if (issues.length >= max) break;
    const lead = leadByEditorialScore(bucket.items, nowMs);
    if (!lead) continue;
    issues.push(
      buildIssue(bucket.id, bucket.title, lead, bucket.items, region, nowMs)
    );
    usedCategories.add(bucket.category);
  }

  const categoryBuckets = [...byCategory.entries()]
    .filter(([category]) => !usedCategories.has(category))
    .sort((a, b) => {
      const leadA = leadByEditorialScore(a[1], nowMs);
      const leadB = leadByEditorialScore(b[1], nowMs);
      if (leadA && leadB) {
        const scoreCmp = compareArticlesByEditorialScore(leadA, leadB, nowMs);
        if (scoreCmp !== 0) return scoreCmp;
      }
      return categorySortIndex(a[0]) - categorySortIndex(b[0]);
    });

  for (const [category, items] of categoryBuckets) {
    if (issues.length >= max) break;
    const lead = leadByEditorialScore(items, nowMs);
    if (!lead) continue;
    issues.push(
      buildIssue(
        `category:${region}:${category}`,
        issueTitleFromArticle(lead),
        lead,
        items,
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
