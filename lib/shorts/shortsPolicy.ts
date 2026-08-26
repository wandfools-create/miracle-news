export type ShortsDesk = "morning" | "evening";

export const SHORTS_MIN_ARTICLES = 3;
export const SHORTS_MAX_ARTICLES = 5;
export const SHORTS_TARGET_SECONDS = 75;
export const SHORTS_MIN_SECONDS = 60;
export const SHORTS_MAX_SECONDS = 90;

const KOREA_SOURCE_HINTS = [
  "chosun",
  "tvchosun",
  "insight",
  "yonhap-kr-radar",
  "조선일보",
  "tv조선",
  "인사이트",
  "연합뉴스 속보",
];

export function isKoreaDeskArticle(article: {
  source?: string | null;
  source_country?: string | null;
}): boolean {
  const source = article.source?.trim().toLowerCase() ?? "";
  if (source.includes("korea herald")) return false;
  if (article.source_country?.trim().toUpperCase() === "KR") return true;
  return KOREA_SOURCE_HINTS.some((hint) => source.includes(hint));
}

export function isArticleRecommendedForDesk(
  article: { source?: string | null; source_country?: string | null },
  desk: ShortsDesk
): boolean {
  const korea = isKoreaDeskArticle(article);
  return desk === "evening" ? korea : !korea;
}

export function validateShortsArticleCount(count: number):
  | { ok: true }
  | { ok: false; message: string } {
  if (count < SHORTS_MIN_ARTICLES) {
    return { ok: false, message: `기사를 최소 ${SHORTS_MIN_ARTICLES}개 선택하세요.` };
  }
  if (count > SHORTS_MAX_ARTICLES) {
    return { ok: false, message: `기사는 최대 ${SHORTS_MAX_ARTICLES}개까지 선택할 수 있습니다.` };
  }
  return { ok: true };
}
