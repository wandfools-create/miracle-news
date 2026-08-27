import {
  SHORTS_MAX_ARTICLES,
  SHORTS_MIN_ARTICLES,
  type ShortsDesk,
} from "@/lib/shorts/shortsPolicy";
import type { ShortsArticleForDedup } from "@/lib/shorts/dedupeShortsArticleSelection";

export type ShortsPublishedArticleRow = ShortsArticleForDedup & {
  source_country: string | null;
  body_translated: string | null;
  body_original: string | null;
  original_url: string | null;
  canonical_url: string | null;
  thumbnail_url: string | null;
  status?: string | null;
  review_status?: string | null;
  is_published?: boolean | null;
  /** Korean localization slug for Hannoon public URL (server-loaded). */
  ko_slug?: string | null;
  /** Korean localization title when available. */
  ko_localization_title?: string | null;
};

export type FetchPublishedArticlesResult =
  | { ok: true; articles: ShortsPublishedArticleRow[] }
  | { ok: false; error: string; step: string };

export function parseShortsArticleIds(raw: unknown): string[] | null {
  if (Array.isArray(raw)) {
    const ids = raw
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
    return ids.length ? ids : null;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return parseShortsArticleIds(parsed);
      } catch {
        return null;
      }
    }
    const ids = trimmed
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    return ids.length ? ids : null;
  }
  return null;
}

export function validateShortsSelectionInput(input: {
  articleIds: string[];
  desk: ShortsDesk;
  editDate: string;
}):
  | { ok: true }
  | { ok: false; error: string; step: string } {
  if (!input.editDate.trim()) {
    return { ok: false, error: "편집 날짜가 필요합니다.", step: "validation" };
  }
  if (input.desk !== "morning" && input.desk !== "evening") {
    return { ok: false, error: "회차(아침/저녁)가 올바르지 않습니다.", step: "validation" };
  }
  const unique = [...new Set(input.articleIds)];
  if (unique.length !== input.articleIds.length) {
    return { ok: false, error: "중복된 기사 ID가 있습니다.", step: "validation" };
  }
  if (unique.length < SHORTS_MIN_ARTICLES) {
    return {
      ok: false,
      error: `기사를 최소 ${SHORTS_MIN_ARTICLES}개 선택하세요.`,
      step: "validation",
    };
  }
  if (unique.length > SHORTS_MAX_ARTICLES) {
    return {
      ok: false,
      error: `기사는 최대 ${SHORTS_MAX_ARTICLES}개까지 선택할 수 있습니다.`,
      step: "validation",
    };
  }
  return { ok: true };
}

/** Verify fetched rows are published and match requested IDs exactly. */
export function verifyPublishedArticleRows(
  requestedIds: string[],
  rows: ShortsPublishedArticleRow[]
): FetchPublishedArticlesResult {
  if (rows.length !== requestedIds.length) {
    const found = new Set(rows.map((r) => r.id));
    const missing = requestedIds.filter((id) => !found.has(id));
    return {
      ok: false,
      error:
        missing.length > 0
          ? `공개된 기사를 찾을 수 없습니다: ${missing.join(", ")}`
          : "요청한 기사 수와 조회 결과가 일치하지 않습니다.",
      step: "published_check",
    };
  }
  for (const row of rows) {
    if (!row.title_ko && !row.title_original) {
      return {
        ok: false,
        error: `기사 ${row.id}에 제목이 없습니다.`,
        step: "published_check",
      };
    }
  }
  return { ok: true, articles: rows };
}

/** Build Supabase select columns for Shorts generation (server-side only). */
export const SHORTS_ARTICLE_SELECT =
  "id, source, source_country, title_ko, title_original, summary_ko, summary_original, body_translated, body_original, original_url, canonical_url, thumbnail_url, published_at, status, review_status, is_published";

export function isPublishedArticleRow(row: {
  status?: string | null;
  review_status?: string | null;
  is_published?: boolean | null;
}): boolean {
  return (
    row.status === "published" &&
    row.review_status === "approved" &&
    row.is_published === true
  );
}
