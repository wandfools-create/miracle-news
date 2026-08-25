/** Non-article RSS items: skip before from-link / OpenAI (AP, Fox, PBS, CSM). */

import { getSportsCollectionSkipReason } from "@/lib/rss/sportsCollectionPolicy";

export const RSS_NON_ARTICLE_PATH_KEYWORDS = [
  "photo-gallery",
  "photos",
  "video",
  "one-photo",
  "podcast",
  "live",
  "gallery",
  "entertainment",
  "celebrity",
  "gossip",
  "boxscore",
  "box-score",
  "scoreboard",
  "scores",
] as const;

export const RSS_PREFILTER_SOURCE_KEYS = [
  "ap",
  "fox-news",
  "pbs-newshour",
  "csm",
  "yonhap",
  "korea-herald",
  "bbc",
  "sciencedaily",
  "chosun",
  "tvchosun",
] as const;

/** TV조선 broadcast / clip / sports-desk titles (not general news). */
export const TVCHOSUN_BROADCAST_TITLE_PATTERNS: Array<{
  label: string;
  pattern: RegExp;
}> = [
  { label: "클로징", pattern: /클로징/ },
  { label: "다시보기", pattern: /다시\s*보기|다시보기/ },
  { label: "풀영상", pattern: /풀\s*영상|풀영상/ },
  { label: "클립", pattern: /클립/ },
  { label: "경기결과", pattern: /경기\s*결과|경기결과/ },
  { label: "하이라이트", pattern: /하이라이트/ },
  { label: "VOD", pattern: /\bVOD\b|방송\s*다시/i },
];

export type RssPrefilterSourceKey = (typeof RSS_PREFILTER_SOURCE_KEYS)[number];

const PREFILTER_SOURCE_KEYS = new Set<string>(RSS_PREFILTER_SOURCE_KEYS);

/** Title phrases → skip (photo / video / live / podcast). */
const RSS_NON_ARTICLE_TITLE_PATTERNS: Array<{ label: string; pattern: RegExp }> =
  [
    { label: "Photo Gallery", pattern: /\bphoto\s+gallery\b/i },
    { label: "Picture Gallery", pattern: /\bpicture\s+gallery\b/i },
    { label: "Image Gallery", pattern: /\bimage\s+gallery\b/i },
    { label: "In pictures", pattern: /\bin\s+pictures\b/i },
    { label: "In photos", pattern: /\bin\s+photos\b/i },
    { label: "top photos", pattern: /\btop\s+photos\b/i },
    { label: "photos of the", pattern: /\bphotos\s+of\s+the\b/i },
    { label: "other top photos", pattern: /\bother\s+top\s+photos\b/i },
    { label: "AP photos", pattern: /\bap\s+photos\b/i },
    { label: "photojournalist", pattern: /\bphotojournalist/i },
    { label: "slideshow", pattern: /\bslide\s*show\b/i },
    { label: "One Photo", pattern: /\bone[\s-]photo\b/i },
    { label: "Live Updates", pattern: /\blive\s+updates?\b/i },
    { label: "Live blog", pattern: /\blive\s+blog\b/i },
    { label: "Live coverage", pattern: /\blive\s+coverage\b/i },
    { label: "liveblog", pattern: /\bliveblog\b/i },
    { label: "Podcast", pattern: /\bpodcast\b/i },
    { label: "Video", pattern: /^\s*video\b/i },
    { label: "Watch", pattern: /^\s*watch\s*:/i },
    { label: "Watch video", pattern: /\bwatch\b[^.]{0,50}\bvideo\b/i },
    { label: "See video", pattern: /\bsee\b[^.]{0,50}\bvideo\b/i },
    { label: "title video", pattern: /\bvideo\s*[|:\-–—]/i },
    { label: "pipe video", pattern: /\|\s*video\b/i },
    { label: "photos title", pattern: /\bphotos\s*[|:\-–—]/i },
    { label: "gallery title", pattern: /\bgallery\s*[|:\-–—]/i },
    { label: "sports box score", pattern: /\bbox[\s-]?score/i },
    { label: "scoreboard", pattern: /\bscoreboard\b/i },
    { label: "final score", pattern: /\bfinal\s+scores?\b/i },
    { label: "game recap score", pattern: /\b(game|match)\s+recap\b/i },
    {
      label: "scoreline",
      pattern:
        /\b(beats?|defeats?|tops?|downs?|vs\.?|versus)\b.{0,40}\b\d{1,3}\s*[-–]\s*\d{1,3}\b/i,
    },
    {
      label: "scoreline reverse",
      pattern: /\b\d{1,3}\s*[-–]\s*\d{1,3}\b.{0,24}\b(inning|quarter|overtime|halftime)\b/i,
    },
    { label: "red carpet", pattern: /\bred\s+carpet\b/i },
    { label: "who wore", pattern: /\bwho\s+wore\b/i },
    { label: "dating rumor", pattern: /\b(dating\s+rumors?|relationship\s+rumors?)\b/i },
    { label: "splits from", pattern: /\bsplits?\s+(from|with)\b/i },
    { label: "spotted with", pattern: /\bspotted\s+(with|kissing|leaving)\b/i },
    { label: "baby bump", pattern: /\bbaby\s+bump\b/i },
    { label: "gossip", pattern: /\b(gossip|tabloid)\b/i },
    { label: "hollywood couple", pattern: /\bhollywood\s+(couple|romance|split)\b/i },
  ];

export type RssItemSkipReason = {
  code:
    | "path_keyword"
    | "title_pattern"
    | "similar_title"
    | "sports_policy"
    | "rss_category"
    | "broadcast_title";
  detail: string;
  summary: string;
};

function isPrefilterSource(sourceKey: string): boolean {
  return PREFILTER_SOURCE_KEYS.has(sourceKey);
}

function segmentMatchesKeyword(segment: string, keyword: string): boolean {
  if (segment === keyword || segment === `${keyword}s`) return true;
  if (segment.startsWith(`${keyword}-`)) return true;
  if (segment.endsWith(`-${keyword}`)) return true;
  if (segment.includes(`-${keyword}-`)) return true;
  return false;
}

/** Match keyword in full pathname (segments, slug fragments, AP /video/ paths). */
function pathnameContainsKeyword(pathname: string, keyword: string): boolean {
  const lower = pathname.toLowerCase();
  const segments = lower.split("/").filter(Boolean);

  if (segments.some((seg) => segmentMatchesKeyword(seg, keyword))) {
    return true;
  }

  const boundaryPatterns = [
    `/${keyword}/`,
    `/${keyword}`,
    `-${keyword}-`,
    `-${keyword}`,
    `${keyword}/`,
  ];
  return boundaryPatterns.some((p) => lower.includes(p));
}

function pathHasNonArticleKeyword(pathname: string): string | null {
  for (const keyword of RSS_NON_ARTICLE_PATH_KEYWORDS) {
    if (pathnameContainsKeyword(pathname, keyword)) {
      return keyword;
    }
  }
  return null;
}

function titleMatchesNonArticlePattern(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  for (const { label, pattern } of RSS_NON_ARTICLE_TITLE_PATTERNS) {
    if (pattern.test(trimmed)) return label;
  }
  return null;
}

function tvChosunBroadcastTitleMatch(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  for (const { label, pattern } of TVCHOSUN_BROADCAST_TITLE_PATTERNS) {
    if (pattern.test(trimmed)) return label;
  }
  return null;
}

function rssCategoryIsSports(categories: string[] | undefined): boolean {
  if (!categories?.length) return false;
  return categories.some((c) => {
    const t = c.trim().toLowerCase();
    return t === "스포츠" || t === "sports" || t === "sport";
  });
}

/** Skip non-text RSS items (galleries, video, live blogs) before enrich. */
export function getRssItemSkipReason(
  sourceKey: string,
  input: {
    title: string;
    url: string;
    summary?: string | null;
    categories?: string[];
  }
): RssItemSkipReason | null {
  if (!isPrefilterSource(sourceKey)) return null;

  let pathname = "";
  try {
    pathname = new URL(input.url).pathname;
  } catch {
    return null;
  }

  if (sourceKey === "tvchosun") {
    if (rssCategoryIsSports(input.categories)) {
      return {
        code: "rss_category",
        detail: "스포츠",
        summary: 'RSS category is "스포츠"',
      };
    }
    const broadcast = tvChosunBroadcastTitleMatch(input.title);
    if (broadcast) {
      return {
        code: "broadcast_title",
        detail: broadcast,
        summary: `TV조선 broadcast/clip title (${broadcast})`,
      };
    }
  }

  const pathKeyword = pathHasNonArticleKeyword(pathname);
  if (pathKeyword) {
    return {
      code: "path_keyword",
      detail: pathKeyword,
      summary: `URL path contains "${pathKeyword}"`,
    };
  }

  const titleMatch = titleMatchesNonArticlePattern(input.title);
  if (titleMatch) {
    return {
      code: "title_pattern",
      detail: titleMatch,
      summary: `Title matches non-article pattern (${titleMatch})`,
    };
  }

  const sportsSkip = getSportsCollectionSkipReason({
    title: input.title,
    summary: input.summary,
    url: input.url,
  });
  if (sportsSkip) {
    return {
      code: "sports_policy",
      detail: sportsSkip.detail,
      summary: sportsSkip.summary,
    };
  }

  return null;
}

export function formatRssItemSkipReason(reason: RssItemSkipReason): string {
  return `${reason.code}: ${reason.summary}`;
}

/** True when enrich failure is likely a gallery/video item that should have been skipped. */
export function shouldReclassifyEnrichFailureAsSkipped(input: {
  sourceKey: string;
  title: string;
  url: string;
  summary?: string | null;
}): RssItemSkipReason | null {
  return getRssItemSkipReason(input.sourceKey, {
    title: input.title,
    url: input.url,
    summary: input.summary,
  });
}
