/** Primary RSS collection targets (ops v1 expansion). */
import type { CollectRegion } from "@/lib/rss/collectRegions";
import {
  COLLECT_REGION_KOREA,
  COLLECT_REGION_US_INTL,
  isSourceInCollectRegion,
} from "@/lib/rss/collectRegions";

export type RssFeedSourceCountry = "US" | "KR" | "GB";

/** Desk category stored on collection_candidates.category when known. */
export type RssFeedCategory =
  | "politics"
  | "economy"
  | "society"
  | "world"
  | "science_tech"
  | "religion"
  | "major_issue"
  | "other";

export type RssFeedSource = {
  /** articles.source / collection_candidates.source key. */
  sourceKey: string;
  label: string;
  /** Human-readable source URL (RSS or API docs). */
  feedUrl: string;
  sourceCountry: RssFeedSourceCountry;
  /**
   * Which regional collect cron owns this feed.
   * us-intl = 08:00 ET; korea = 20:00 ET.
   */
  collectRegion: CollectRegion;
  /** Default: standard RSS via `feedUrl`. AP GraphQL; Yonhap KR sitemaps; Insight HTML lists. */
  fetchKind?: "rss" | "ap-graphql" | "yna-sitemap-radar" | "insight-section-list";
  apCategoryPath?: string;
  /**
   * Per-publisher insert cap for this sourceKey (default RSS_MAX_INSERTS_PER_FEED).
   * Yonhap KR radar uses 3 so it stays a small auxiliary budget.
   */
  maxInsertsPerRun?: number;
  /** When set, used as candidate category (overrides title inference). */
  category?: RssFeedCategory;
  /**
   * When false, cron/collect skips this feed (no new candidates).
   * Keep the row for future KR-native Yonhap etc. Default true.
   */
  enabled?: boolean;
  /** Optional operator note (shown in admin source health). */
  disabledReason?: string;
};

export const RSS_FEED_SOURCES: RssFeedSource[] = [
  {
    sourceKey: "pbs-newshour",
    label: "PBS NewsHour",
    feedUrl: "https://www.pbs.org/newshour/feeds/rss/headlines",
    sourceCountry: "US",
    collectRegion: COLLECT_REGION_US_INTL,
  },
  {
    sourceKey: "pbs-newshour",
    label: "PBS NewsHour · 정치",
    feedUrl: "https://www.pbs.org/newshour/feeds/rss/politics",
    sourceCountry: "US",
    collectRegion: COLLECT_REGION_US_INTL,
    category: "politics",
  },
  {
    sourceKey: "ap",
    label: "AP",
    /** Legacy RSS host (DNS dead). Collected via AP GraphQL instead. */
    feedUrl: "https://apnews.com/graphql/delivery/ap/v1",
    fetchKind: "ap-graphql",
    apCategoryPath: "/",
    sourceCountry: "US",
    collectRegion: COLLECT_REGION_US_INTL,
  },
  {
    sourceKey: "fox-news",
    label: "Fox News",
    feedUrl: "https://moxie.foxnews.com/google-publisher/latest.xml",
    sourceCountry: "US",
    collectRegion: COLLECT_REGION_US_INTL,
  },
  {
    sourceKey: "csm",
    label: "The Christian Science Monitor",
    feedUrl: "https://rss.csmonitor.com/feeds/world",
    sourceCountry: "US",
    collectRegion: COLLECT_REGION_US_INTL,
  },
  {
    sourceKey: "yonhap",
    label: "Yonhap News Agency (English)",
    feedUrl: "https://en.yna.co.kr/RSS/news.xml",
    sourceCountry: "KR",
    collectRegion: COLLECT_REGION_KOREA,
    /** English scrapes of KR news — low display value; prefer future KR-native path. */
    enabled: false,
    disabledReason:
      "영문판 우회·중복 수집 품질이 낮아 자동 수집 비활성. 기존 후보·기사는 유지. 향후 한국어 본판 검토용으로 행 유지.",
  },
  {
    sourceKey: "korea-herald",
    label: "The Korea Herald",
    /**
     * `/rss` is an HTML index page (rss-parser fails with "Unexpected close tag").
     * Stable RSS 2.0 endpoint listed as application/rss+xml alternate on that page.
     * English KR outlet — morning US/intl desk (not native Korean evening).
     */
    feedUrl: "https://www.koreaherald.com/rss/newsAll",
    sourceCountry: "KR",
    collectRegion: COLLECT_REGION_US_INTL,
  },
  {
    sourceKey: "bbc",
    label: "BBC World",
    feedUrl: "https://feeds.bbci.co.uk/news/world/rss.xml",
    sourceCountry: "GB",
    collectRegion: COLLECT_REGION_US_INTL,
  },
  {
    sourceKey: "sciencedaily",
    label: "ScienceDaily",
    feedUrl: "https://www.sciencedaily.com/rss/all.xml",
    sourceCountry: "US",
    collectRegion: COLLECT_REGION_US_INTL,
  },
  {
    sourceKey: "chosun",
    label: "조선일보",
    feedUrl:
      "https://www.chosun.com/arc/outboundfeeds/rss/category/politics/?outputType=xml",
    sourceCountry: "KR",
    collectRegion: COLLECT_REGION_KOREA,
    category: "politics",
  },
  {
    sourceKey: "chosun",
    label: "조선일보",
    feedUrl:
      "https://www.chosun.com/arc/outboundfeeds/rss/category/economy/?outputType=xml",
    sourceCountry: "KR",
    collectRegion: COLLECT_REGION_KOREA,
    category: "economy",
  },
  {
    sourceKey: "chosun",
    label: "조선일보",
    feedUrl:
      "https://www.chosun.com/arc/outboundfeeds/rss/category/national/?outputType=xml",
    sourceCountry: "KR",
    collectRegion: COLLECT_REGION_KOREA,
    category: "society",
  },
  {
    sourceKey: "chosun",
    label: "조선일보",
    feedUrl:
      "https://www.chosun.com/arc/outboundfeeds/rss/category/international/?outputType=xml",
    sourceCountry: "KR",
    collectRegion: COLLECT_REGION_KOREA,
    category: "world",
  },
  {
    sourceKey: "tvchosun",
    label: "TV조선",
    feedUrl: "https://news.tvchosun.com/site/data/rss/politics.xml",
    sourceCountry: "KR",
    collectRegion: COLLECT_REGION_KOREA,
    category: "politics",
  },
  {
    sourceKey: "tvchosun",
    label: "TV조선",
    feedUrl: "https://news.tvchosun.com/site/data/rss/economy.xml",
    sourceCountry: "KR",
    collectRegion: COLLECT_REGION_KOREA,
    category: "economy",
  },
  {
    sourceKey: "tvchosun",
    label: "TV조선",
    feedUrl: "https://news.tvchosun.com/site/data/rss/national.xml",
    sourceCountry: "KR",
    collectRegion: COLLECT_REGION_KOREA,
    category: "society",
  },
  {
    sourceKey: "tvchosun",
    label: "TV조선",
    feedUrl: "https://news.tvchosun.com/site/data/rss/international.xml",
    sourceCountry: "KR",
    collectRegion: COLLECT_REGION_KOREA,
    category: "world",
  },
  {
    sourceKey: "yonhap-kr-radar",
    label: "연합뉴스 속보",
    /** Docs / primary sitemap; collector fetches all YONHAP_KR_RADAR_SITEMAPS. */
    feedUrl: "https://www.yna.co.kr/news-sitemap6.xml",
    fetchKind: "yna-sitemap-radar",
    sourceCountry: "KR",
    collectRegion: COLLECT_REGION_KOREA,
    maxInsertsPerRun: 3,
  },
  /**
   * Insight Korea — no public RSS (403/404). Section HTML NewsArticle cards only.
   * Soft/entertainment desks (/enter, /life, /trend) intentionally omitted.
   */
  {
    sourceKey: "insight",
    label: "인사이트",
    feedUrl: "https://www.insight.co.kr/politics",
    fetchKind: "insight-section-list",
    sourceCountry: "KR",
    collectRegion: COLLECT_REGION_KOREA,
    category: "politics",
  },
  {
    sourceKey: "insight",
    label: "인사이트",
    feedUrl: "https://www.insight.co.kr/economy",
    fetchKind: "insight-section-list",
    sourceCountry: "KR",
    collectRegion: COLLECT_REGION_KOREA,
    category: "economy",
  },
  {
    sourceKey: "insight",
    label: "인사이트",
    feedUrl: "https://www.insight.co.kr/national",
    fetchKind: "insight-section-list",
    sourceCountry: "KR",
    collectRegion: COLLECT_REGION_KOREA,
    category: "society",
  },
  {
    sourceKey: "insight",
    label: "인사이트",
    feedUrl: "https://www.insight.co.kr/global",
    fetchKind: "insight-section-list",
    sourceCountry: "KR",
    collectRegion: COLLECT_REGION_KOREA,
    category: "world",
  },
];

/** Feeds that cron/collect actually fetches (optionally region-filtered). */
export function getActiveRssFeedSources(
  region?: CollectRegion | null
): RssFeedSource[] {
  return RSS_FEED_SOURCES.filter((f) => {
    if (f.enabled === false) return false;
    if (!region) return true;
    return (
      f.collectRegion === region ||
      isSourceInCollectRegion(f.sourceKey, region)
    );
  });
}

/** Unique source keys among active feeds (multi-category publishers count once). */
export function getActiveRssPublisherKeys(
  region?: CollectRegion | null
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const feed of getActiveRssFeedSources(region)) {
    if (seen.has(feed.sourceKey)) continue;
    seen.add(feed.sourceKey);
    keys.push(feed.sourceKey);
  }
  return keys;
}

export function isRssFeedSourceEnabled(sourceKey: string): boolean {
  const feed = RSS_FEED_SOURCES.find((f) => f.sourceKey === sourceKey);
  if (!feed) return false;
  return feed.enabled !== false;
}

/** Legacy stub rows (title/link/summary only). */
export const RSS_SOURCE_SECTION_STUB = "rss:collect-v1";

/** After from-link auto-enrich (v2). */
export const RSS_SOURCE_SECTION_ENRICHED = "rss:collect-v2";

export const RSS_SOURCE_SECTION = RSS_SOURCE_SECTION_ENRICHED;

export const RSS_AI_REVIEW_NOTE_STUB =
  "RSS 1차 수집: 제목·링크·요약만 저장됨. 본문·한글 번역은 검토 후 from-link 또는 수동 보강.";

export const RSS_AI_REVIEW_NOTE_ENRICHED =
  "RSS 2차 자동 보강(from-link): 본문 추출·OpenAI 초안·한글 번역 반영. 검토 후 승인 필요 — 자동 공개 없음.";

export const RSS_AI_REVIEW_NOTE_CANDIDATE =
  "RSS 수집 후보에서 관리자가 「기사 만들기」로 from-link 보강. 검토 후 승인 필요 — 자동 공개 없음. AI 썸네일 미생성.";

export const RSS_AI_REVIEW_NOTE = RSS_AI_REVIEW_NOTE_ENRICHED;
