/**
 * Yonhap KR "속보 레이더" — title rules only (no OpenAI, no article body).
 * Goal: detect breaking / major KR issues; reject sports, soft news, fluff.
 */

import { getSportsCollectionSkipReason } from "@/lib/rss/sportsCollectionPolicy";
import { findVerySimilarTitle } from "@/lib/rss/rssTitleSimilarity";

export const YONHAP_KR_RADAR_SOURCE_KEY = "yonhap-kr-radar";
export const YONHAP_KR_RADAR_LABEL = "연합뉴스 속보";

/** Hard cap per collect run — small auxiliary budget. */
export const YONHAP_KR_RADAR_MAX_INSERTS_PER_RUN = 3;

export const YONHAP_KR_RADAR_SITEMAPS = [
  "https://www.yna.co.kr/news-sitemap3.xml",
  "https://www.yna.co.kr/news-sitemap4.xml",
  "https://www.yna.co.kr/news-sitemap5.xml",
  "https://www.yna.co.kr/news-sitemap6.xml",
] as const;

export type YonhapRadarItem = {
  title: string;
  link: string;
  publishedAt: string | null;
};

export type YonhapRadarDecision =
  | { action: "allow"; reason: string }
  | { action: "skip"; reason: string };

const BREAKING_TITLE =
  /\[속보\]|^\s*속보\b|\b속보\b|긴급/;

/** Soft / non-news desks to exclude even if a keyword matches. */
const EXCLUDE_PATTERNS: RegExp[] = [
  /연예|가수|배우|아이돌|셀럽|가십|열애|결혼\s*발표|이혼\s*설/,
  /스포츠|야구|축구|농구|배구|골프|올림픽\s*예선|경기\s*결과|득점|홈런|이적료/,
  /날씨\s*전망|오늘\s*날씨|주말\s*날씨|미세먼지\s*예보/,
  /맛집|여행\s*코스|생활\s*팁|건강\s*팁|다이어트|요리\s*법/,
  /사진\s*기사|포토\s*뉴스|\[사진\]|화보|영상\s*뉴스|클립|다시보기|풀영상/,
  /인사\s*발령|정기\s*인사|취임식|기념식|축하\s*행사|개막식\s*참석/,
  /부고|별세\s*안내|장례\s*일정/,
];

/**
 * Major-issue signals — need substance, not a single weak token alone
 * (except explicit 속보/긴급 which are handled separately).
 */
const MAJOR_TOPIC: RegExp[] = [
  /대통령|청와대|국무총리|정부|내각|장관/,
  /국회|여야|의원|법안|탄핵|선거/,
  /법원|대법원|헌재|헌법재판소|검찰|특검/,
  /외교|정상회담|외무장관|대사관|제재/,
  /전쟁|군사|북한|핵|미사일|계엄/,
  /재난|지진|산불|홍수|폭우|태풍|참사|대형\s*사고|테러/,
  /금융\s*위기|긴급\s*조치|금리\s*인하|환율\s*급|증시\s*폭락|디폴트/,
];

/** Weak alone — do not allow unless paired with another major signal or 속보. */
const WEAK_ALONE = /정부|국회|법원/;

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function countMajorHits(title: string): number {
  return MAJOR_TOPIC.reduce((n, p) => (p.test(title) ? n + 1 : n), 0);
}

/**
 * Rule-based allow/skip for Yonhap KR radar titles.
 * Prefer explicit breaking markers; otherwise require clear major-news substance.
 */
export function evaluateYonhapKrRadarTitle(
  title: string,
  url?: string
): YonhapRadarDecision {
  const t = title.trim();
  if (!t) return { action: "skip", reason: "empty_title" };

  if (hasAny(t, EXCLUDE_PATTERNS)) {
    return { action: "skip", reason: "excluded_soft_or_desk" };
  }

  const sports = getSportsCollectionSkipReason({
    title: t,
    summary: null,
    url: url || "https://www.yna.co.kr/view/AKR000",
  });
  if (sports) {
    return { action: "skip", reason: `sports:${sports.detail}` };
  }

  if (BREAKING_TITLE.test(t)) {
    // 속보 still reject if clearly soft/sports (already checked).
    // Require some news substance beyond the marker alone.
    const stripped = t.replace(/\[?\s*속보\s*\]?/g, "").replace(/긴급/g, "").trim();
    if (stripped.length < 8) {
      return { action: "skip", reason: "breaking_too_thin" };
    }
    return { action: "allow", reason: "breaking_marker" };
  }

  const hits = countMajorHits(t);
  if (hits >= 2) {
    return { action: "allow", reason: "major_multi_signal" };
  }

  if (hits === 1) {
    // Single weak token (정부/국회/법원 alone) → skip.
    const onlyWeak =
      WEAK_ALONE.test(t) &&
      !/대통령|청와대|탄핵|특검|헌재|북한|미사일|전쟁|재난|지진|산불|홍수|테러|정상회담|계엄/.test(
        t
      );
    if (onlyWeak && t.length < 28) {
      return { action: "skip", reason: "weak_single_keyword" };
    }
    // Strong single topics or longer substantive headlines.
    if (
      /대통령|북한|미사일|전쟁|계엄|특검|탄핵|헌재|지진|산불|홍수|테러|정상회담|참사/.test(
        t
      ) ||
      t.length >= 24
    ) {
      return { action: "allow", reason: "major_single_substantive" };
    }
    return { action: "skip", reason: "major_too_weak" };
  }

  return { action: "skip", reason: "not_major" };
}

/**
 * Among same-event 속보 bursts, keep the newest / most specific title only.
 * Uses a slightly looser overlap than general RSS dedupe so Korean wire
 * updates (짧은 속보 → 보강 속보) collapse reliably.
 */
export function selectYonhapRadarClusterRepresentatives(
  items: YonhapRadarItem[]
): YonhapRadarItem[] {
  const kept: YonhapRadarItem[] = [];

  const ordered = [...items].sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    if (tb !== ta) return tb - ta;
    return b.title.length - a.title.length;
  });

  for (const item of ordered) {
    if (isSameYonhapRadarEvent(item.title, kept.map((k) => k.title))) {
      continue;
    }
    kept.push(item);
  }

  return kept;
}

function normalizeRadarTitle(title: string): string {
  return title
    .replace(/\[?\s*속보\s*\]?/g, " ")
    .replace(/긴급/g, " ")
    .toLowerCase()
    .trim();
}

/** Korean wire titles are often 2-syllable tokens — looser than English RSS. */
function radarTitleTokens(title: string): string[] {
  const tokens = normalizeRadarTitle(title)
    .replace(/['’]/g, "")
    .split(/[^a-z0-9가-힣]+/i)
    .map((t) => t.trim())
    .filter((t) => {
      if (!t) return false;
      if (/[가-힣]/.test(t)) return t.length >= 2;
      return t.length >= 3;
    });
  return [...new Set(tokens)];
}

function isSameYonhapRadarEvent(
  title: string,
  existingTitles: string[]
): boolean {
  const similar = findVerySimilarTitle(title, existingTitles);
  if (similar) return true;

  const tokens = radarTitleTokens(title);
  if (tokens.length < 3) return false;
  const incoming = new Set(tokens);

  for (const existing of existingTitles) {
    const otherTokens = radarTitleTokens(existing);
    if (otherTokens.length < 3) continue;
    const other = new Set(otherTokens);
    let shared = 0;
    for (const t of incoming) {
      if (other.has(t)) shared += 1;
    }
    const union = incoming.size + other.size - shared;
    const score = union === 0 ? 0 : shared / union;
    if (shared >= 3 && score >= 0.45) return true;
    if (shared >= 4 && score >= 0.4) return true;
  }
  return false;
}

/** Guess desk category from title (best-effort; null ok). */
export function guessYonhapRadarCategory(
  title: string
): "politics" | "economy" | "society" | "world" | null {
  const t = title;
  if (/외교|북한|미사일|전쟁|미국|중국|일본|이란|제재|정상회담/.test(t)) {
    return "world";
  }
  if (/대통령|국회|청와대|여야|법무|검찰|특검|탄핵|선거/.test(t)) {
    return "politics";
  }
  if (/금리|증시|환율|금융|세금|종부세|경제|재정/.test(t)) {
    return "economy";
  }
  if (/경찰|법원|참사|실종|재난|지진|산불|홍수|사고/.test(t)) {
    return "society";
  }
  return null;
}
