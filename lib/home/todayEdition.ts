import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import {
  formatAmericaNewYorkDateKey,
  getAmericaNewYorkParts,
} from "@/lib/cron/americaNewYork";
import { getSitePublishedTimestamp } from "./articleFreshness";
import {
  pickFeaturedArticle,
  pickFeaturedHubArticles,
} from "./featuredSelection";
import {
  compareArticlesByEditorialScore,
  filterHomeCoreEligible,
  homeCoreSpotlightPickOptions,
  pickDiversifiedByEditorialScore,
} from "./editorialRanking";
import {
  detectEventLifecycleStage,
  filterEventFamilyLeaders,
  withInheritedEventFamilyGrades,
} from "./eventFamilyUpdate";
import { formatEditionLastUpdated } from "./homeRelativeTime";
import { offsetNyDateKey, nyDateKeyDiff } from "./homeRelativeTime";
import { pickTrendingIssues } from "./pickTrendingIssues";
import { pickPreviousEditionFeatured } from "./pickPreviousEditionFeatured";
import { normalizeTopicClusterKey } from "./topicClusterKey";
import type {
  HomeArticleCard,
  TrendingIssue,
  TrendingIssuesBlock,
} from "./types";
import { getArticleRegion } from "./articleRegion";

export const SPOTLIGHT_MAX_MS = 24 * 60 * 60 * 1000;
export const TRENDING_MAX_MS = 48 * 60 * 60 * 1000;
export const PREVIOUS_HIGHLIGHTS_MIN_DAYS = 1;
export const PREVIOUS_HIGHLIGHTS_MAX_DAYS = 7;
export const PREVIOUS_HIGHLIGHTS_LIMIT = 5;
export const TODAY_TOP_STORIES_PER_COLUMN = 6;

export type TodayEditionStatus = "ready" | "preparing" | "carryover";

export type TodayEdition = {
  editionDateKey: string;
  todayArticles: HomeArticleCard[];
  previousArticles: HomeArticleCard[];
  todayCount: number;
  lastUpdatedAt: string | null;
  status: TodayEditionStatus;
  featured: HomeArticleCard | null;
  secondaryFeatured: HomeArticleCard | null;
  featuredRelated: HomeArticleCard[];
  spotlight: HomeArticleCard[];
  trending: TrendingIssuesBlock | null;
  previousHighlights: HomeArticleCard[];
  /** Server-computed header copy (avoid hydration mismatch). */
  headerDateKo: string;
  headerDateEn: string;
  editionTitleKo: string;
  editionTitleEn: string;
  statusLineKo: string;
  statusLineEn: string;
  preparingMessageKo: string;
  preparingMessageEn: string;
  preparingPhaseKo: string;
  preparingPhaseEn: string;
};

function articleKey(article: HomeArticleCard): string {
  return article.article_id ?? article.id;
}

/** NY calendar date from Hannoon site published_at only. */
export function getArticleSitePublishNyDateKey(
  article: HomeArticleCard
): string {
  return formatAmericaNewYorkDateKey(article.published_at ?? "");
}

export function getEditionDateKey(nowMs: number): string {
  return formatAmericaNewYorkDateKey(new Date(nowMs));
}

export function isTodayArticleBySitePublish(
  article: HomeArticleCard,
  editionDateKey: string
): boolean {
  const key = getArticleSitePublishNyDateKey(article);
  return Boolean(key) && key === editionDateKey;
}

export function filterTodayArticlesBySitePublish(
  articles: HomeArticleCard[],
  editionDateKey: string
): HomeArticleCard[] {
  return articles.filter((a) => isTodayArticleBySitePublish(a, editionDateKey));
}

export function filterBySitePublishAge(
  articles: HomeArticleCard[],
  nowMs: number,
  maxMs: number
): HomeArticleCard[] {
  return articles.filter((a) => {
    const ts = getSitePublishedTimestamp(a);
    return ts > 0 && nowMs - ts <= maxMs;
  });
}

function isWithinPreviousHighlightsWindow(
  article: HomeArticleCard,
  editionDateKey: string
): boolean {
  const key = getArticleSitePublishNyDateKey(article);
  if (!key || key === editionDateKey) return false;

  const ageDays = nyDateKeyDiff(key, editionDateKey);
  if (ageDays < PREVIOUS_HIGHLIGHTS_MIN_DAYS) return false;
  if (ageDays > PREVIOUS_HIGHLIGHTS_MAX_DAYS) return false;

  return getSitePublishedTimestamp(article) > 0;
}

export function collectTrendingArticleKeys(
  block: TrendingIssuesBlock | null,
  articles: HomeArticleCard[]
): Set<string> {
  const bySlug = new Map(
    articles
      .filter((a) => a.slug?.trim())
      .map((a) => [a.slug!.trim(), a])
  );
  const keys = new Set<string>();
  if (!block) return keys;

  for (const issue of [...block.us, ...block.kr]) {
    const related = [
      issue.primaryArticle,
      ...issue.relatedArticles,
    ].filter(Boolean);
    for (const item of related) {
      const art = bySlug.get(item!.slug.trim());
      if (art) keys.add(articleKey(art));
    }
  }
  return keys;
}

export function collectUsedSurfaceArticleKeys(input: {
  featured?: HomeArticleCard | null;
  secondaryFeatured?: HomeArticleCard | null;
  featuredRelated?: HomeArticleCard[];
  spotlight?: HomeArticleCard[];
  trending?: TrendingIssuesBlock | null;
  allArticles?: HomeArticleCard[];
}): Set<string> {
  const keys = new Set<string>();
  for (const a of [
    input.featured,
    input.secondaryFeatured,
    ...(input.featuredRelated ?? []),
    ...(input.spotlight ?? []),
  ]) {
    if (a) keys.add(articleKey(a));
  }
  if (input.trending && input.allArticles) {
    for (const k of collectTrendingArticleKeys(input.trending, input.allArticles)) {
      keys.add(k);
    }
  }
  return keys;
}

function formatEditionHeaderDate(nowMs: number, locale: ArticleLocale): string {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(nowMs));
}

function preparingPhase(nowMs: number, locale: ArticleLocale): string {
  const hour = getAmericaNewYorkParts(new Date(nowMs)).hour;
  if (locale === "ko") {
    return hour < 12 ? "오전 뉴스 준비 중" : "오늘 뉴스 준비 중";
  }
  return hour < 12 ? "Morning edition in progress" : "Today's news in progress";
}

function buildStatusLines(
  todayCount: number,
  lastUpdatedAt: string | null,
  locale: ArticleLocale
): { ko: string; en: string } {
  if (todayCount === 0) {
    return {
      ko: "오늘 공개 0건 · 뉴스 준비 중",
      en: "0 stories today · News in progress",
    };
  }

  const lastKo = lastUpdatedAt
    ? formatEditionLastUpdated(lastUpdatedAt, "ko")
    : "";
  const lastEn = lastUpdatedAt
    ? formatEditionLastUpdated(lastUpdatedAt, "en")
    : "";

  return {
    ko: lastKo
      ? `오늘 공개 ${todayCount}건 · 마지막 업데이트 ${lastKo}`
      : `오늘 공개 ${todayCount}건`,
    en: lastEn
      ? `${todayCount} ${todayCount === 1 ? "story" : "stories"} today · Last updated ${lastEn}`
      : `${todayCount} ${todayCount === 1 ? "story" : "stories"} today`,
  };
}

function compareTodayFirst(
  a: HomeArticleCard,
  b: HomeArticleCard,
  editionDateKey: string,
  nowMs: number
): number {
  const aToday = isTodayArticleBySitePublish(a, editionDateKey) ? 1 : 0;
  const bToday = isTodayArticleBySitePublish(b, editionDateKey) ? 1 : 0;
  if (bToday !== aToday) return bToday - aToday;
  return compareArticlesByEditorialScore(a, b, nowMs);
}

function pickTodayEditionSpotlight(
  articles: HomeArticleCard[],
  editionDateKey: string,
  nowMs: number,
  options: {
    excludeKeys?: Set<string>;
    reservedCoreArticles?: HomeArticleCard[];
    limit?: number;
  } = {}
): HomeArticleCard[] {
  const limit = options.limit ?? 5;
  const within24h = filterBySitePublishAge(articles, nowMs, SPOTLIGHT_MAX_MS);
  if (within24h.length === 0) return [];

  const sorted = [...within24h].sort((a, b) =>
    compareTodayFirst(a, b, editionDateKey, nowMs)
  );

  const leaders = filterEventFamilyLeaders(
    withInheritedEventFamilyGrades(sorted)
  );

  return pickDiversifiedByEditorialScore(leaders, {
    ...homeCoreSpotlightPickOptions(
      options.reservedCoreArticles ?? [],
      options.excludeKeys
    ),
    limit,
    nowMs,
  });
}

/** Secondary featured when today has only one story — prior eligible major article (1–7d). */
export function pickFeaturedSecondaryBackfill(
  articles: HomeArticleCard[],
  editionDateKey: string,
  nowMs: number,
  options?: { excludeKeys?: Set<string> }
): HomeArticleCard | null {
  const picks = pickPreviousHighlights(articles, editionDateKey, nowMs, options);
  return picks[0] ?? null;
}

/**
 * Ensure a second featured card whenever the eligible pool has another article.
 * Selection order: today core → today published → 7-day core.
 * Angle/grade constraints may prefer a better pair, but must not leave the
 * second slot empty when another eligible article_id exists.
 */
export function pickSecondaryFeaturedFallback(
  articles: HomeArticleCard[],
  featured: HomeArticleCard,
  options: {
    nowMs: number;
    editionDateKey: string;
    todayArticles?: HomeArticleCard[];
  }
): HomeArticleCard | null {
  const nowMs = options.nowMs;
  const featuredKey = articleKey(featured);
  const exclude = new Set<string>([featuredKey]);

  const pickFrom = (pool: HomeArticleCard[]): HomeArticleCard | null => {
    const eligible = filterHomeCoreEligible(
      pool.filter((a) => articleKey(a) !== featuredKey && a.id !== featured.id),
      nowMs
    );
    if (eligible.length === 0) return null;

    const hub = pickFeaturedHubArticles([...eligible, featured], featured, {
      nowMs,
    });
    if (hub.leads[1] && articleKey(hub.leads[1]) !== featuredKey) {
      return hub.leads[1];
    }

    const leaders = filterEventFamilyLeaders(
      withInheritedEventFamilyGrades(eligible)
    );
    const rankedPool = leaders.length > 0 ? leaders : eligible;
    return (
      pickDiversifiedByEditorialScore(rankedPool, {
        limit: 1,
        nowMs,
        sourceCap: 2,
        balanceRegions: false,
        suppressTopicClusters: false,
        excludeKeys: exclude,
        reservedCoreArticles: [featured],
      })[0] ??
      [...rankedPool].sort((a, b) =>
        compareArticlesByEditorialScore(a, b, nowMs)
      )[0] ??
      null
    );
  };

  const todayArticles = options.todayArticles ?? [];
  const todayCore = filterHomeCoreEligible(todayArticles, nowMs);
  return (
    pickFrom(todayCore) ??
    pickFrom(todayArticles) ??
    pickFeaturedSecondaryBackfill(articles, options.editionDateKey, nowMs, {
      excludeKeys: exclude,
    }) ??
    pickFrom(articles)
  );
}

function pickSpotlightWithBackfill(
  articles: HomeArticleCard[],
  editionDateKey: string,
  nowMs: number,
  options: {
    excludeKeys?: Set<string>;
    reservedCoreArticles?: HomeArticleCard[];
    limit?: number;
  } = {}
): HomeArticleCard[] {
  const limit = options.limit ?? 5;
  const spotlight = pickTodayEditionSpotlight(articles, editionDateKey, nowMs, {
    ...options,
    limit,
  });
  if (spotlight.length >= limit) return spotlight;

  const usedKeys = new Set(options.excludeKeys ?? []);
  for (const article of spotlight) usedKeys.add(articleKey(article));

  const backfillPool = filterHomeCoreEligible(
    articles.filter((a) => !usedKeys.has(articleKey(a))),
    nowMs
  );
  const sorted = [...backfillPool].sort((a, b) =>
    compareTodayFirst(a, b, editionDateKey, nowMs)
  );
  const leaders = filterEventFamilyLeaders(
    withInheritedEventFamilyGrades(sorted)
  );
  const need = limit - spotlight.length;
  if (need <= 0 || leaders.length === 0) return spotlight;

  const backfill = pickDiversifiedByEditorialScore(leaders, {
    ...homeCoreSpotlightPickOptions(
      options.reservedCoreArticles ?? [],
      usedKeys
    ),
    limit: need,
    nowMs,
  });

  return [...spotlight, ...backfill];
}

function isOngoingIssueBucket(items: HomeArticleCard[]): boolean {
  if (items.length >= 2) {
    const cluster = normalizeTopicClusterKey({
      topic_key: items[0]?.topic_key,
      topic_label: items[0]?.topic_label,
      title: items[0]?.title ?? "",
    });
    if (cluster) return true;

    const families = new Set(
      items.map((a) => a.topic_key ?? a.topic_label ?? "").filter(Boolean)
    );
    if (families.size >= 1 && items.length >= 2) return true;
  }

  const lead = items[0];
  if (!lead) return false;
  const stage = detectEventLifecycleStage(lead);
  return stage === "active_crisis" || stage === "official_toll";
}

function enrichTrendingWithContinuingFlag(
  block: TrendingIssuesBlock,
  articles: HomeArticleCard[],
  nowMs: number
): TrendingIssuesBlock {
  const articleBySlug = new Map(
    articles.filter((a) => a.slug?.trim()).map((a) => [a.slug!.trim(), a])
  );

  const enrich = (issue: TrendingIssue): TrendingIssue | null => {
    const slug = issue.primaryArticle?.slug?.trim();
    const lead = slug ? articleBySlug.get(slug) : undefined;
    if (!lead) return issue;

    const leadTs = getSitePublishedTimestamp(lead);
    if (leadTs <= 0) return null;
    if (nowMs - leadTs > TRENDING_MAX_MS) return null;

    const ageMs = nowMs - leadTs;
    const isOlderThan24h = ageMs > SPOTLIGHT_MAX_MS;

    if (isOlderThan24h) {
      /**
       * Topic-keyed issues already share a locale-stable topic_key identity.
       * Do not drop them based on localized title/summary lifecycle text
       * (e.g. KO "사망 2,911" → official_toll while EN "deaths" → unknown),
       * which would erase an entire US/KR Trending block on one language only.
       */
      if (issue.id.startsWith("topic:") && lead.topic_key?.trim()) {
        return { ...issue, continuingIssue: true };
      }

      const bucketArticles = articles.filter((a) => {
        const cluster = normalizeTopicClusterKey({
          topic_key: a.topic_key,
          topic_label: a.topic_label,
          title: a.title,
        });
        if (issue.id.startsWith("topic:") && cluster) {
          return issue.id === `topic:${cluster}`;
        }
        if (issue.id.startsWith("category:")) {
          const [, region, category] = issue.id.split(":");
          return (
            a.category === category &&
            (region === "us" || region === "kr")
          );
        }
        return false;
      });

      if (!isOngoingIssueBucket(bucketArticles.length ? bucketArticles : [lead])) {
        return null;
      }

      return { ...issue, continuingIssue: true };
    }

    return issue;
  };

  return {
    us: block.us.map(enrich).filter(Boolean) as TrendingIssue[],
    kr: block.kr.map(enrich).filter(Boolean) as TrendingIssue[],
  };
}

export function pickTodayEditionTrendingIssues(
  articles: HomeArticleCard[],
  pageLocale: ArticleLocale,
  nowMs: number,
  maxPerRegion = 3
): TrendingIssuesBlock | null {
  const within48h = filterBySitePublishAge(articles, nowMs, TRENDING_MAX_MS);
  const raw = pickTrendingIssues(within48h, pageLocale, maxPerRegion, nowMs);

  // Restrict pool to 48h — pickTrendingIssues may expand via filterArticlesForHomeSurface.
  const filtered = enrichTrendingWithContinuingFlag(raw, within48h, nowMs);

  if (filtered.us.length === 0 && filtered.kr.length === 0) return null;
  return filtered;
}

export function pickPreviousHighlights(
  articles: HomeArticleCard[],
  editionDateKey: string,
  nowMs: number,
  options?: { excludeKeys?: Set<string> }
): HomeArticleCard[] {
  const pool = articles.filter(
    (a) =>
      isWithinPreviousHighlightsWindow(a, editionDateKey) &&
      !options?.excludeKeys?.has(articleKey(a))
  );
  const eligible = filterHomeCoreEligible(pool, nowMs);
  const leaders = filterEventFamilyLeaders(
    withInheritedEventFamilyGrades(eligible)
  );

  return pickDiversifiedByEditorialScore(leaders, {
    limit: PREVIOUS_HIGHLIGHTS_LIMIT,
    nowMs,
    sourceCap: 2,
    balanceRegions: true,
    suppressTopicClusters: true,
    excludeKeys: options?.excludeKeys,
  });
}

export type TodayTopStoriesColumns = {
  leftTitle: string;
  rightTitle: string;
  left: HomeArticleCard[];
  right: HomeArticleCard[];
};

export function pickTodayTopStoriesColumns(
  todayArticles: HomeArticleCard[],
  pageLocale: ArticleLocale,
  columnLabels: { leftTitle: string; rightTitle: string },
  nowMs: number,
  options?: { excludeKeys?: Set<string> }
): TodayTopStoriesColumns | null {
  const exclude = options?.excludeKeys ?? new Set<string>();
  const pool = todayArticles.filter((a) => !exclude.has(articleKey(a)));
  if (pool.length === 0) return null;

  const eligible = filterHomeCoreEligible(pool, nowMs);
  const leaders = filterEventFamilyLeaders(
    withInheritedEventFamilyGrades(eligible)
  );
  if (leaders.length === 0) return null;

  const krPool = leaders.filter((a) => getArticleRegion(a) === "kr");
  const usPool = leaders.filter((a) => getArticleRegion(a) === "us");

  const pickColumn = (regionPool: HomeArticleCard[]) =>
    pickDiversifiedByEditorialScore(regionPool, {
      limit: TODAY_TOP_STORIES_PER_COLUMN,
      nowMs,
      sourceCap: 2,
      balanceRegions: false,
      suppressTopicClusters: true,
      excludeKeys: exclude,
    });

  const left =
    pageLocale === "ko" ? pickColumn(krPool) : pickColumn(usPool);
  const right =
    pageLocale === "ko" ? pickColumn(usPool) : pickColumn(krPool);

  if (left.length === 0 && right.length === 0) return null;

  return {
    leftTitle: columnLabels.leftTitle,
    rightTitle: columnLabels.rightTitle,
    left,
    right,
  };
}

export type BuildTodayEditionOptions = {
  nowMs?: number;
  locale?: ArticleLocale;
};

export function buildTodayEdition(
  articles: HomeArticleCard[],
  options: BuildTodayEditionOptions = {}
): TodayEdition {
  const nowMs = options.nowMs ?? Date.now();
  const editionDateKey = getEditionDateKey(nowMs);

  const todayArticles = filterTodayArticlesBySitePublish(
    articles,
    editionDateKey
  );
  const todayCount = todayArticles.length;

  const todayCore = filterHomeCoreEligible(todayArticles, nowMs);

  let featured: HomeArticleCard | null = null;
  let secondaryFeatured: HomeArticleCard | null = null;
  let featuredRelated: HomeArticleCard[] = [];
  let status: TodayEditionStatus = "ready";

  if (todayCount === 0) {
    const carryover = pickPreviousEditionFeatured(articles, {
      nowMs,
      locale: options.locale,
    });
    if (carryover?.featured) {
      status = "carryover";
      featured = carryover.featured;
      secondaryFeatured = carryover.secondaryFeatured;
      featuredRelated = carryover.featuredRelated;
    } else {
      status = "preparing";
    }
  } else {
    featured = pickFeaturedArticle(todayCore, nowMs);
    if (featured && todayCount >= 2) {
      const hub = pickFeaturedHubArticles(todayCore, featured, { nowMs });
      secondaryFeatured = hub.leads[1] ?? null;
      featuredRelated = hub.related;
    }
  }

  if (featured && !secondaryFeatured) {
    secondaryFeatured = pickSecondaryFeaturedFallback(articles, featured, {
      nowMs,
      editionDateKey,
      todayArticles,
    });
    if (secondaryFeatured && featuredRelated.length === 0) {
      const combined = filterHomeCoreEligible(
        [featured, secondaryFeatured, ...todayArticles],
        nowMs
      );
      const hub = pickFeaturedHubArticles(combined, featured, { nowMs });
      const secondaryKey = articleKey(secondaryFeatured);
      featuredRelated = hub.related.filter(
        (a) => articleKey(a) !== secondaryKey
      );
    }
  }

  const reservedCore: HomeArticleCard[] = [];
  if (featured) reservedCore.push(featured);
  if (secondaryFeatured) reservedCore.push(secondaryFeatured);

  const coreExclude = new Set<string>();
  for (const a of reservedCore) coreExclude.add(articleKey(a));

  const trending = pickTodayEditionTrendingIssues(
    articles,
    options.locale ?? "ko",
    nowMs,
    3
  );

  const trendingKeys = collectTrendingArticleKeys(trending, articles);
  for (const k of trendingKeys) coreExclude.add(k);

  const spotlight = pickSpotlightWithBackfill(articles, editionDateKey, nowMs, {
    excludeKeys: coreExclude,
    reservedCoreArticles: reservedCore,
    limit: 5,
  });

  const usedSurfaceKeys = collectUsedSurfaceArticleKeys({
    featured,
    secondaryFeatured,
    featuredRelated,
    spotlight,
    trending,
    allArticles: articles,
  });

  const previousHighlights = pickPreviousHighlights(
    articles,
    editionDateKey,
    nowMs,
    { excludeKeys: usedSurfaceKeys }
  );

  const previousArticles = articles.filter(
    (a) =>
      !isTodayArticleBySitePublish(a, editionDateKey) &&
      getSitePublishedTimestamp(a) > 0
  );

  const lastUpdatedAt =
    todayCount > 0
      ? todayArticles.reduce<string | null>((max, a) => {
          const ts = a.published_at;
          if (!ts) return max;
          if (!max) return ts;
          return new Date(ts).getTime() > new Date(max).getTime() ? ts : max;
        }, null)
      : null;

  const statusLines = buildStatusLines(todayCount, lastUpdatedAt, "ko");

  const isCarryover = status === "carryover";

  return {
    editionDateKey,
    todayArticles,
    previousArticles,
    todayCount,
    lastUpdatedAt,
    status,
    featured,
    secondaryFeatured,
    featuredRelated,
    spotlight,
    trending,
    previousHighlights,
    headerDateKo: formatEditionHeaderDate(nowMs, "ko"),
    headerDateEn: formatEditionHeaderDate(nowMs, "en"),
    editionTitleKo: isCarryover ? "최근 주요 기사" : "오늘의 한눈",
    editionTitleEn: isCarryover ? "Recent top story" : "Today's Hannoon",
    statusLineKo: statusLines.ko,
    statusLineEn: statusLines.en,
    preparingMessageKo:
      "오늘의 주요뉴스를 준비하고 있습니다.\n수집·검토 후 새로운 기사가 업데이트됩니다.",
    preparingMessageEn:
      "Today's top stories are being prepared.\nNew stories will appear after collection and editorial review.",
    preparingPhaseKo: preparingPhase(nowMs, "ko"),
    preparingPhaseEn: preparingPhase(nowMs, "en"),
  };
}

/** NY date keys for the previous-highlights window (inclusive): yesterday through 7 days ago. */
export function previousHighlightsDateKeyRange(
  editionDateKey: string
): { minKey: string; maxKey: string } {
  return {
    minKey: offsetNyDateKey(editionDateKey, -PREVIOUS_HIGHLIGHTS_MAX_DAYS),
    maxKey: offsetNyDateKey(editionDateKey, -PREVIOUS_HIGHLIGHTS_MIN_DAYS),
  };
}
