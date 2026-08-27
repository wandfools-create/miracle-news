/**
 * Home editorial ranking Phase 1 — importance + site freshness + diversity.
 * No OpenAI. Does not change publish/SAME EVENT guards.
 *
 * Priority (high → low), within the home core eligibility window:
 * 1. is_top_story with full boost only while site-published within 72h
 * 2. editorial_priority_manual (human-locked; still must be in 7d core pool)
 * 3. AI recommend grade (+ score fine-tune within grade)
 * 4. automatic editorial_priority (site-publish window)
 * 5. site published_at freshness
 */
import { normalizeSource } from "@/lib/article/normalizeSource";
import { homePolicyPoints } from "@/lib/editorialPolicy/signals";
import {
  getEditorialFreshnessTimestamp,
  HOME_SURFACE_FALLBACK_MS,
  HOME_SURFACE_PRIMARY_MS,
  normalizeEditorialPriority,
  type EditorialPriority,
} from "./articleFreshness";
import {
  normalizeStoredAiRecommendGrade,
  normalizeStoredAiRecommendScore,
  type AiRecommendGrade,
} from "./aiRecommendSnapshot";
import { getArticleRegion, type ArticleRegion } from "./articleRegion";
import {
  HOME_CORE_EVENT_FAMILY_MAX,
  isDistinctEventAngle,
  normalizeEventFamilyKey,
  normalizeTopicClusterKey,
} from "./topicClusterKey";
import type { HomeArticleCard } from "./types";

export { HOME_CORE_EVENT_FAMILY_MAX };

export { getEditorialFreshnessTimestamp };

/** Full top-story boost — only while site published_at is within this window. */
export const TOP_STORY_FORCE_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * Home core surfaces (featured / 지금 주목 / KR·US) never include articles
 * older than this site-publish age. Prefer showing fewer slots over archive fill.
 */
export const HOME_CORE_MAX_WINDOW_MS = HOME_SURFACE_FALLBACK_MS; // 7d

/** Primary expansion step for sidebar / related (72h). */
export const HOME_CORE_PRIMARY_WINDOW_MS = HOME_SURFACE_PRIMARY_MS;

/** Full pin boost while within TOP_STORY_FORCE_WINDOW_MS. */
export const TOP_STORY_BASE_POINTS = 1_000_000;
/** Subtracted by top_story_order so lower order ranks higher within pins. */
export const TOP_STORY_ORDER_SLACK = 1_000;

/**
 * Limited boost for is_top_story between 72h and 7d (still inside core pool).
 * Below AI priority band so it cannot dominate recent AI-ranked coverage.
 */
export const TOP_STORY_HISTORICAL_POINTS = 5_000;

/**
 * Human-locked editorial_priority points.
 * Must stay above AI grade bands so AI cannot override manual priority.
 * Only meaningful inside the 7d core pool (pool filter excludes older rows).
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
  /** Politics/economy / mega-event / soft-news policy layer (PR editorial-policy). */
  policy: number;
};

function articleKey(article: HomeArticleCard): string {
  return article.article_id ?? article.id;
}

export function isWithinSiteWindow(
  article: HomeArticleCard,
  nowMs: number,
  windowMs: number
): boolean {
  const freshTs = getEditorialFreshnessTimestamp(article);
  if (freshTs <= 0) return false;
  return nowMs - freshTs <= windowMs;
}

/** Site-publish age in ms, or null when unknown. */
export function getSitePublishAgeMs(
  article: HomeArticleCard,
  nowMs: number = Date.now()
): number | null {
  const freshTs = getEditorialFreshnessTimestamp(article);
  if (freshTs <= 0) return null;
  return Math.max(0, nowMs - freshTs);
}

/**
 * Full 1M-class top-story boost eligibility: is_top_story + site publish ≤ 72h.
 * Does not use source_published_at alone (editorial freshness prefers published_at).
 */
export function isForceTopStoryPin(
  article: HomeArticleCard,
  nowMs: number = Date.now()
): boolean {
  if (article.is_top_story !== true) return false;
  return isWithinSiteWindow(article, nowMs, TOP_STORY_FORCE_WINDOW_MS);
}

/** Eligible for featured / sidebar / KR·US core rails (≤ 7d site publish). */
export function isHomeCoreEligible(
  article: HomeArticleCard,
  nowMs: number = Date.now()
): boolean {
  return isWithinSiteWindow(article, nowMs, HOME_CORE_MAX_WINDOW_MS);
}

export function filterHomeCoreEligible(
  articles: HomeArticleCard[],
  nowMs: number = Date.now()
): HomeArticleCard[] {
  return articles.filter((a) => isHomeCoreEligible(a, nowMs));
}

/**
 * 72h pool first; if thinner than minCount, expand to 7d.
 * Never injects out-of-window top stories and never expands past 7d.
 */
export function filterHomeCoreSurfacePool(
  articles: HomeArticleCard[],
  options?: { nowMs?: number; minCount?: number }
): HomeArticleCard[] {
  const nowMs = options?.nowMs ?? Date.now();
  const minCount = options?.minCount ?? 1;
  const primary = articles.filter((a) =>
    isWithinSiteWindow(a, nowMs, HOME_CORE_PRIMARY_WINDOW_MS)
  );
  if (primary.length >= minCount) return primary;
  return filterHomeCoreEligible(articles, nowMs);
}

export function computeEditorialScore(
  article: HomeArticleCard,
  nowMs: number = Date.now()
): EditorialScoreBreakdown {
  let topStory = 0;
  if (article.is_top_story === true) {
    const order = article.top_story_order ?? 0;
    if (isForceTopStoryPin(article, nowMs)) {
      topStory =
        TOP_STORY_BASE_POINTS + Math.max(0, TOP_STORY_ORDER_SLACK - order);
    } else if (isHomeCoreEligible(article, nowMs)) {
      // 72h–7d: small historical nod only; no permanent pin.
      topStory = TOP_STORY_HISTORICAL_POINTS;
    }
  }

  const priority = normalizeEditorialPriority(article.editorial_priority);
  const manual = article.editorial_priority_manual === true;
  let manualPriority = 0;
  let editorialPriority = 0;
  if (manual) {
    // Human lock outranks AI, but only while the row is in the 7d core window.
    // Older manuals do not bypass home core eligibility (pool filter).
    if (isHomeCoreEligible(article, nowMs)) {
      manualPriority = MANUAL_PRIORITY_POINTS[priority];
    }
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

  const policy = isHomeCoreEligible(article, nowMs)
    ? homePolicyPoints({
        title: article.title,
        summary: article.summary,
        source: article.source,
        category: article.category,
        source_country: article.source_country,
      })
    : 0;

  const total =
    topStory +
    manualPriority +
    aiGrade +
    aiScore +
    editorialPriority +
    freshness +
    policy;

  return {
    total,
    topStory,
    manualPriority,
    aiGrade,
    aiScore,
    editorialPriority,
    freshness,
    policy,
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
  /**
   * Already-selected core surface articles (e.g. featured + 보조).
   * Count toward event-family caps; also excluded by key from picking.
   */
  reservedCoreArticles?: HomeArticleCard[];
  /**
   * Max articles per event family across reserved + this pick.
   * Featured + 「지금 주목」 use HOME_CORE_EVENT_FAMILY_MAX (2).
   */
  maxPerEventFamily?: number;
  /**
   * When a family already has ≥1 in reserved+picked, allow another only if
   * UPDATE / DIFFERENT ANGLE. Default false (opt-in for core surfaces).
   */
  requireDistinctAngleForSecond?: boolean;
};

function topicSignal(article: HomeArticleCard) {
  return {
    topic_key: article.topic_key,
    topic_label: article.topic_label,
    title: article.title,
  };
}

function familyOf(article: HomeArticleCard): string | null {
  return normalizeEventFamilyKey(topicSignal(article));
}

/**
 * Greedy pick by editorial score with source / region / topic / event-family diversity.
 * Source cap relaxes (+1 repeatedly) when not enough unique picks remain.
 * Event-family caps never relax — prefer empty slots over same-event fill.
 * Never invents articles outside the provided list (caller supplies ≤7d pool).
 */
export function pickDiversifiedByEditorialScore(
  articles: HomeArticleCard[],
  options: DiversifiedPickOptions
): HomeArticleCard[] {
  const nowMs = options.nowMs ?? Date.now();
  const limit = Math.max(0, options.limit);
  if (limit === 0) return [];

  const reserved = options.reservedCoreArticles ?? [];
  const exclude = new Set(options.excludeKeys ?? []);
  for (const a of reserved) {
    exclude.add(articleKey(a));
    if (a.id) exclude.add(a.id);
  }

  const baseCap = options.sourceCap ?? DEFAULT_SOURCE_CAP;
  const sorted = sortArticlesByEditorialScore(
    articles.filter((a) => !exclude.has(articleKey(a)) && !exclude.has(a.id)),
    nowMs
  );

  const familyOpts = {
    reserved,
    maxPerEventFamily: options.maxPerEventFamily,
    requireDistinctAngleForSecond:
      options.requireDistinctAngleForSecond === true,
  };

  let sourceCap = baseCap;
  for (let relax = 0; relax < 6; relax += 1) {
    const picked = tryPick(sorted, {
      limit,
      nowMs,
      sourceCap,
      balanceRegions: options.balanceRegions === true,
      suppressTopicClusters: options.suppressTopicClusters !== false,
      ...familyOpts,
    });
    if (picked.length >= limit || picked.length >= sorted.length) {
      return picked.slice(0, limit);
    }
    sourceCap += 1;
  }

  // Final pass: keep family caps; only relax source (already at high cap).
  return tryPick(sorted, {
    limit,
    nowMs,
    sourceCap,
    balanceRegions: false,
    suppressTopicClusters: options.suppressTopicClusters !== false,
    ...familyOpts,
  }).slice(0, limit);
}

function tryPick(
  sorted: HomeArticleCard[],
  opts: {
    limit: number;
    nowMs: number;
    sourceCap: number;
    balanceRegions: boolean;
    suppressTopicClusters: boolean;
    reserved: HomeArticleCard[];
    maxPerEventFamily?: number;
    requireDistinctAngleForSecond: boolean;
  }
): HomeArticleCard[] {
  const out: HomeArticleCard[] = [];
  const seen = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const topicSeen = new Set<string>();
  let us = 0;
  let kr = 0;

  const familyMembers = (family: string): HomeArticleCard[] => [
    ...opts.reserved.filter((a) => familyOf(a) === family),
    ...out.filter((a) => familyOf(a) === family),
  ];

  for (let i = 0; i < sorted.length; i += 1) {
    const article = sorted[i];
    if (out.length >= opts.limit) break;
    const key = articleKey(article);
    if (seen.has(key)) continue;

    const source = normalizeSource(article.source);
    const sourceCount = sourceCounts.get(source) ?? 0;
    if (sourceCount >= opts.sourceCap) continue;

    if (opts.suppressTopicClusters) {
      const topic = normalizeTopicClusterKey(topicSignal(article));
      if (topic && topicSeen.has(topic)) continue;
    }

    const family = familyOf(article);
    if (family && opts.maxPerEventFamily != null) {
      const existing = familyMembers(family);
      if (existing.length >= opts.maxPerEventFamily) continue;
      if (
        opts.requireDistinctAngleForSecond &&
        existing.length >= 1 &&
        !isDistinctEventAngle(topicSignal(article), existing.map(topicSignal))
      ) {
        continue;
      }
    }

    if (opts.balanceRegions && out.length > 0) {
      const region = getArticleRegion(article);
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
    const topic = normalizeTopicClusterKey(topicSignal(article));
    if (topic) topicSeen.add(topic);
    const region = getArticleRegion(article);
    if (region === "us") us += 1;
    else kr += 1;
    out.push(article);
  }

  return out;
}

/** Shared options for 「지금 주목」 given featured (+ 보조) already chosen. */
export function homeCoreSpotlightPickOptions(
  reservedCoreArticles: HomeArticleCard[],
  excludeKeys?: Set<string>
): DiversifiedPickOptions {
  return {
    limit: 5,
    sourceCap: 2,
    balanceRegions: true,
    suppressTopicClusters: true,
    excludeKeys,
    reservedCoreArticles,
    maxPerEventFamily: HOME_CORE_EVENT_FAMILY_MAX,
    requireDistinctAngleForSecond: true,
  };
}

export function regionOf(article: HomeArticleCard): ArticleRegion {
  return getArticleRegion(article);
}
