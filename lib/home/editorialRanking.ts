/**
 * Home editorial ranking Phase 1 — importance + site freshness + diversity.
 * No OpenAI. Does not change publish/SAME EVENT guards.
 *
 * Priority (high → low):
 * 1. is_top_story (manual pin until cleared)
 * 2. editorial_priority_manual (human-locked)
 * 3. AI recommend grade (+ score fine-tune within grade)
 * 4. automatic editorial_priority (site-publish window)
 * 5. site published_at freshness
 */
import { normalizeSource } from "@/lib/article/normalizeSource";
import {
  getEditorialFreshnessTimestamp,
  normalizeEditorialPriority,
  type EditorialPriority,
} from "./articleFreshness";
import {
  normalizeStoredAiRecommendGrade,
  normalizeStoredAiRecommendScore,
  type AiRecommendGrade,
} from "./aiRecommendSnapshot";
import { getArticleRegion, type ArticleRegion } from "./articleRegion";
import { normalizeTopicClusterKey } from "./topicClusterKey";
import type { HomeArticleCard } from "./types";

export { getEditorialFreshnessTimestamp };

/** Manual top-story pin — outranks every other home ranking signal until cleared. */
export const TOP_STORY_BASE_POINTS = 1_000_000;
/** Subtracted by top_story_order so lower order ranks higher within pins. */
export const TOP_STORY_ORDER_SLACK = 1_000;

/**
 * Human-locked editorial_priority points.
 * Must stay above AI grade bands so AI cannot override manual priority.
 */
export const MANUAL_PRIORITY_POINTS: Record<EditorialPriority, number> = {
  normal: 0,
  issue: 40_000,
  special: 60_000,
  breaking: 80_000,
};

/**
 * AI recommend grade bands.
 * Gaps are >> AI_SCORE_MAX so score 0–100 only fine-tunes order inside a grade.
 */
export const AI_GRADE_POINTS: Record<AiRecommendGrade, number> = {
  best: 25_000,
  priority: 15_000,
  normal: 0,
  low: -5_000,
};

/** Max contribution from ai_recommend_score (0–100). Must stay below grade gaps. */
export const AI_SCORE_MAX_POINTS = 100;

/** Automatic (non-manual) editorial_priority boost while within site window. */
export const AUTO_PRIORITY_POINTS: Record<EditorialPriority, number> = {
  normal: 0,
  issue: 4_000,
  special: 8_000,
  breaking: 12_000,
};

/** Non-manual editorial_priority boost decays after this site-publish age. */
export const EDITORIAL_PRIORITY_SITE_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * AI grade/score apply only within this site-publish window so a very old
 * "best" cannot permanently pin above fresher coverage.
 */
export const AI_GRADE_SITE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Freshness component uses a 72h site-publish ramp. */
export const EDITORIAL_FRESHNESS_WINDOW_MS = 72 * 60 * 60 * 1000;

/** Max points from the freshness ramp (below auto breaking, above noise). */
export const FRESHNESS_MAX_POINTS = 10_000;

export const DEFAULT_SOURCE_CAP = 2;

export type EditorialScoreBreakdown = {
  total: number;
  topStory: number;
  manualPriority: number;
  aiGrade: number;
  aiScore: number;
  editorialPriority: number;
  freshness: number;
};

function articleKey(article: HomeArticleCard): string {
  return article.article_id ?? article.id;
}

function isWithinSiteWindow(
  article: HomeArticleCard,
  nowMs: number,
  windowMs: number
): boolean {
  const freshTs = getEditorialFreshnessTimestamp(article);
  if (freshTs <= 0) return false;
  return nowMs - freshTs <= windowMs;
}

export function computeEditorialScore(
  article: HomeArticleCard,
  nowMs: number = Date.now()
): EditorialScoreBreakdown {
  let topStory = 0;
  if (article.is_top_story === true) {
    const order = article.top_story_order ?? 0;
    topStory =
      TOP_STORY_BASE_POINTS + Math.max(0, TOP_STORY_ORDER_SLACK - order);
  }

  const priority = normalizeEditorialPriority(article.editorial_priority);
  const manual = article.editorial_priority_manual === true;
  let manualPriority = 0;
  let editorialPriority = 0;
  if (manual) {
    // Human lock: AI grade/score must not weaken or override this band.
    manualPriority = MANUAL_PRIORITY_POINTS[priority];
  } else if (
    priority !== "normal" &&
    isWithinSiteWindow(article, nowMs, EDITORIAL_PRIORITY_SITE_WINDOW_MS)
  ) {
    editorialPriority = AUTO_PRIORITY_POINTS[priority];
  }

  let aiGrade = 0;
  let aiScore = 0;
  // Manual lock: AI must not override or weaken human priority.
  if (
    !manual &&
    isWithinSiteWindow(article, nowMs, AI_GRADE_SITE_WINDOW_MS)
  ) {
    const grade = normalizeStoredAiRecommendGrade(article.ai_recommend_grade);
    aiGrade = grade ? AI_GRADE_POINTS[grade] : 0;
    const score = normalizeStoredAiRecommendScore(article.ai_recommend_score);
    // Fine-tune only within the grade band (0–100 << grade gaps).
    aiScore = score ?? 0;
  }

  const freshTs = getEditorialFreshnessTimestamp(article);
  let freshness = 0;
  if (freshTs > 0) {
    const age = Math.max(0, nowMs - freshTs);
    const remain = Math.max(0, EDITORIAL_FRESHNESS_WINDOW_MS - age);
    freshness = Math.round(
      (remain / EDITORIAL_FRESHNESS_WINDOW_MS) * FRESHNESS_MAX_POINTS
    );
  }

  const total =
    topStory +
    manualPriority +
    aiGrade +
    aiScore +
    editorialPriority +
    freshness;

  return {
    total,
    topStory,
    manualPriority,
    aiGrade,
    aiScore,
    editorialPriority,
    freshness,
  };
}

export function compareArticlesByEditorialScore(
  a: HomeArticleCard,
  b: HomeArticleCard,
  nowMs: number = Date.now()
): number {
  const scoreDiff =
    computeEditorialScore(b, nowMs).total - computeEditorialScore(a, nowMs).total;
  if (scoreDiff !== 0) return scoreDiff;

  const freshDiff =
    getEditorialFreshnessTimestamp(b) - getEditorialFreshnessTimestamp(a);
  if (freshDiff !== 0) return freshDiff;

  return articleKey(a).localeCompare(articleKey(b));
}

export function sortArticlesByEditorialScore(
  articles: HomeArticleCard[],
  nowMs: number = Date.now()
): HomeArticleCard[] {
  return [...articles].sort((a, b) =>
    compareArticlesByEditorialScore(a, b, nowMs)
  );
}

export type DiversifiedPickOptions = {
  limit: number;
  nowMs?: number;
  /** Max articles per normalized source; relaxed automatically when pool is thin. */
  sourceCap?: number;
  /** Soft region balance for mixed lists (featured/sidebar). */
  balanceRegions?: boolean;
  /** Suppress repeat topic clusters within this pick. */
  suppressTopicClusters?: boolean;
  excludeKeys?: Set<string>;
};

/**
 * Greedy pick by editorial score with source / region / topic diversity.
 * Source cap relaxes (+1 repeatedly) when not enough unique picks remain.
 */
export function pickDiversifiedByEditorialScore(
  articles: HomeArticleCard[],
  options: DiversifiedPickOptions
): HomeArticleCard[] {
  const nowMs = options.nowMs ?? Date.now();
  const limit = Math.max(0, options.limit);
  if (limit === 0) return [];

  const exclude = options.excludeKeys ?? new Set<string>();
  const baseCap = options.sourceCap ?? DEFAULT_SOURCE_CAP;
  const sorted = sortArticlesByEditorialScore(
    articles.filter((a) => !exclude.has(articleKey(a))),
    nowMs
  );

  let sourceCap = baseCap;
  for (let relax = 0; relax < 6; relax += 1) {
    const picked = tryPick(sorted, {
      limit,
      nowMs,
      sourceCap,
      balanceRegions: options.balanceRegions === true,
      suppressTopicClusters: options.suppressTopicClusters !== false,
    });
    if (picked.length >= limit || picked.length >= sorted.length) {
      return picked.slice(0, limit);
    }
    sourceCap += 1;
  }

  // Final fill: still honor topic suppress; only source/region caps are relaxed away.
  const seen = new Set<string>();
  const topicSeen = new Set<string>();
  const out: HomeArticleCard[] = [];
  for (const article of sorted) {
    const key = articleKey(article);
    if (seen.has(key)) continue;
    if (options.suppressTopicClusters !== false) {
      const topic = normalizeTopicClusterKey({
        topic_key: article.topic_key,
        topic_label: article.topic_label,
        title: article.title,
      });
      if (topic && topicSeen.has(topic)) continue;
      if (topic) topicSeen.add(topic);
    }
    seen.add(key);
    out.push(article);
    if (out.length >= limit) break;
  }
  return out;
}

function tryPick(
  sorted: HomeArticleCard[],
  opts: {
    limit: number;
    nowMs: number;
    sourceCap: number;
    balanceRegions: boolean;
    suppressTopicClusters: boolean;
  }
): HomeArticleCard[] {
  const out: HomeArticleCard[] = [];
  const seen = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const topicSeen = new Set<string>();
  let us = 0;
  let kr = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const article = sorted[i];
    if (out.length >= opts.limit) break;
    const key = articleKey(article);
    if (seen.has(key)) continue;

    const source = normalizeSource(article.source);
    const sourceCount = sourceCounts.get(source) ?? 0;
    if (sourceCount >= opts.sourceCap) continue;

    if (opts.suppressTopicClusters) {
      const topic = normalizeTopicClusterKey({
        topic_key: article.topic_key,
        topic_label: article.topic_label,
        title: article.title,
      });
      if (topic && topicSeen.has(topic)) continue;
    }

    if (opts.balanceRegions && out.length > 0) {
      const region = getArticleRegion(article);
      // Soft: when one region is ahead by 2+, prefer the other if available later.
      if (region === "us" && us >= kr + 2) {
        const hasKrLater = sorted.slice(i + 1).some((a) => {
          const k = articleKey(a);
          if (seen.has(k)) return false;
          return getArticleRegion(a) === "kr";
        });
        if (hasKrLater) continue;
      }
      if (region === "kr" && kr >= us + 2) {
        const hasUsLater = sorted.slice(i + 1).some((a) => {
          const k = articleKey(a);
          if (seen.has(k)) return false;
          return getArticleRegion(a) === "us";
        });
        if (hasUsLater) continue;
      }
    }

    seen.add(key);
    sourceCounts.set(source, sourceCount + 1);
    const topic = normalizeTopicClusterKey({
      topic_key: article.topic_key,
      topic_label: article.topic_label,
      title: article.title,
    });
    if (topic) topicSeen.add(topic);
    const region = getArticleRegion(article);
    if (region === "us") us += 1;
    else kr += 1;
    out.push(article);
  }

  return out;
}

export function regionOf(article: HomeArticleCard): ArticleRegion {
  return getArticleRegion(article);
}
