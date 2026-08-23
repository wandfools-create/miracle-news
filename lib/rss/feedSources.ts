/** Primary RSS collection targets (ops v1 expansion). */
export type RssFeedSourceCountry = "US" | "KR" | "GB";

export type RssFeedSource = {
  /** articles.source / collection_candidates.source key. */
  sourceKey: string;
  label: string;
  /** Human-readable source URL (RSS or API docs). */
  feedUrl: string;
  sourceCountry: RssFeedSourceCountry;
  /** Default: standard RSS via `feedUrl`. AP uses GraphQL (feeds.apnews.com is defunct). */
  fetchKind?: "rss" | "ap-graphql";
  apCategoryPath?: string;
};

export const RSS_FEED_SOURCES: RssFeedSource[] = [
  {
    sourceKey: "pbs-newshour",
    label: "PBS NewsHour",
    feedUrl: "https://www.pbs.org/newshour/feeds/rss/headlines",
    sourceCountry: "US",
  },
  {
    sourceKey: "ap",
    label: "AP",
    /** Legacy RSS host (DNS dead). Collected via AP GraphQL instead. */
    feedUrl: "https://apnews.com/graphql/delivery/ap/v1",
    fetchKind: "ap-graphql",
    apCategoryPath: "/",
    sourceCountry: "US",
  },
  {
    sourceKey: "fox-news",
    label: "Fox News",
    feedUrl: "https://moxie.foxnews.com/google-publisher/latest.xml",
    sourceCountry: "US",
  },
  {
    sourceKey: "csm",
    label: "The Christian Science Monitor",
    feedUrl: "https://rss.csmonitor.com/feeds/world",
    sourceCountry: "US",
  },
  {
    sourceKey: "yonhap",
    label: "Yonhap News Agency",
    feedUrl: "https://en.yna.co.kr/RSS/news.xml",
    sourceCountry: "KR",
  },
  {
    sourceKey: "korea-herald",
    label: "The Korea Herald",
    feedUrl: "https://www.koreaherald.com/rss",
    sourceCountry: "KR",
  },
  {
    sourceKey: "bbc",
    label: "BBC World",
    feedUrl: "https://feeds.bbci.co.uk/news/world/rss.xml",
    sourceCountry: "GB",
  },
  {
    sourceKey: "sciencedaily",
    label: "ScienceDaily",
    feedUrl: "https://www.sciencedaily.com/rss/all.xml",
    sourceCountry: "US",
  },
];

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
