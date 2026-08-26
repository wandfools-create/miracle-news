import { resolveArticleSourceKey } from "@/lib/article/sourceRegion";
import {
  COLLECT_REGION_KOREA,
  COLLECT_REGION_US_INTL,
  isSourceInCollectRegion,
} from "@/lib/rss/collectRegions";

export type ShortsDesk = "morning" | "evening";

export const SHORTS_MIN_ARTICLES = 3;
export const SHORTS_MAX_ARTICLES = 5;
export const SHORTS_TARGET_SECONDS = 75;
export const SHORTS_MIN_SECONDS = 60;
export const SHORTS_MAX_SECONDS = 90;

/** Resolve canonical source key from stored article fields (no new sources). */
export function resolveShortsSourceKey(article: {
  source?: string | null;
  source_country?: string | null;
}): string | null {
  return resolveArticleSourceKey({
    source: article.source ?? "",
    original_url: null,
  });
}

/**
 * Evening (Korea) desk — uses collectRegions KOREA keys only.
 * Korea Herald (`korea-herald`) stays on US/International morning desk per collectRegions.
 */
export function isKoreaDeskArticle(article: {
  source?: string | null;
  source_country?: string | null;
}): boolean {
  const key = resolveShortsSourceKey(article);
  if (key) {
    return isSourceInCollectRegion(key, COLLECT_REGION_KOREA);
  }
  return article.source_country?.trim().toUpperCase() === "KR";
}

export function isArticleRecommendedForDesk(
  article: { source?: string | null; source_country?: string | null },
  desk: ShortsDesk
): boolean {
  const key = resolveShortsSourceKey(article);
  if (key) {
    const region =
      desk === "evening" ? COLLECT_REGION_KOREA : COLLECT_REGION_US_INTL;
    return isSourceInCollectRegion(key, region);
  }
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
