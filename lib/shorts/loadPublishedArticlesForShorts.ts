import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  SHORTS_ARTICLE_SELECT,
  isPublishedArticleRow,
  verifyPublishedArticleRows,
  type ShortsPublishedArticleRow,
} from "@/lib/shorts/fetchPublishedArticlesForShorts";

export type LoadPublishedArticlesResult =
  | { ok: true; articles: ShortsPublishedArticleRow[] }
  | { ok: false; error: string; step: string };

type LocalizationRow = {
  article_id: string;
  slug: string | null;
  title: string | null;
};

export async function loadPublishedArticlesByIds(
  articleIds: string[]
): Promise<LoadPublishedArticlesResult> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("articles")
    .select(SHORTS_ARTICLE_SELECT)
    .in("id", articleIds);

  if (error) {
    return {
      ok: false,
      error: `기사 조회 실패: ${error.message}`,
      step: "db_fetch",
    };
  }

  const rows = (data ?? []) as ShortsPublishedArticleRow[];
  const unpublished = rows.filter((row) => !isPublishedArticleRow(row));
  if (unpublished.length > 0) {
    return {
      ok: false,
      error: `공개되지 않은 기사가 포함되어 있습니다: ${unpublished.map((r) => r.id).join(", ")}`,
      step: "published_check",
    };
  }

  const verified = verifyPublishedArticleRows(articleIds, rows);
  if (!verified.ok) {
    return { ok: false, error: verified.error, step: verified.step };
  }

  const { data: locs, error: locError } = await admin
    .from("article_localizations")
    .select("article_id, slug, title")
    .eq("locale", "ko")
    .in("article_id", articleIds);

  if (locError) {
    return {
      ok: false,
      error: `공개 기사 URL 조회 실패: ${locError.message}`,
      step: "localization_fetch",
    };
  }

  const byId = new Map<string, LocalizationRow>();
  for (const row of (locs ?? []) as LocalizationRow[]) {
    byId.set(row.article_id, row);
  }

  const withPublic = verified.articles.map((article) => {
    const loc = byId.get(article.id);
    return {
      ...article,
      ko_slug: loc?.slug ?? null,
      ko_localization_title: loc?.title ?? null,
    };
  });

  return { ok: true, articles: withPublic };
}
