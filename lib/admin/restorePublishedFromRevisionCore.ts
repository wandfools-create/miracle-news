/**
 * Restore previously-published articles from needs_revision → published.
 * Service role; no OpenAI; no content/localization rewrites; preserves published_at.
 */

import "server-only";

import {
  buildRestorePublishedFromRevisionUpdate,
  evaluateRestorePublishedEligibility,
  restorePublishedFailReasonLabel,
  summarizeRestoreItemOutcomes,
  type RestorePublishedFailReason,
} from "@/lib/admin/restorePublishedFromRevision";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

export type RestorePublishedItemResult = {
  articleId: string;
  ok: boolean;
  reason?: RestorePublishedFailReason | "update_failed" | "race";
  message: string;
  publishedAt?: string | null;
  koSlug?: string | null;
  enSlug?: string | null;
};

export type RestorePublishedCoreResult = {
  ok: boolean;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  successIds: string[];
  items: RestorePublishedItemResult[];
  error?: string;
  step?: string;
};

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

type ArticleRow = {
  id: string;
  status: string | null;
  review_status: string | null;
  revision_status: string | null;
  is_published: boolean | null;
  published_at: string | null;
};

type LocRow = {
  article_id: string;
  locale: string;
  slug: string | null;
};

export async function restorePublishedFromRevisionCore(
  articleIds: string[]
): Promise<RestorePublishedCoreResult> {
  const unique = uniqueIds(articleIds);
  if (unique.length === 0) {
    return {
      ok: false,
      successCount: 0,
      skippedCount: 0,
      failedCount: 0,
      successIds: [],
      items: [],
      error: "선택된 기사가 없습니다.",
      step: "validation",
    };
  }

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return {
      ok: false,
      successCount: 0,
      skippedCount: 0,
      failedCount: unique.length,
      successIds: [],
      items: unique.map((articleId) => ({
        articleId,
        ok: false,
        reason: "update_failed",
        message: envCheck.error,
      })),
      error: envCheck.error,
      step: envCheck.step,
    };
  }

  const { client } = createServiceRoleSupabaseClient();

  const { data: articles, error: fetchError } = await client
    .from("articles")
    .select(
      "id, status, review_status, revision_status, is_published, published_at"
    )
    .in("id", unique);

  if (fetchError) {
    return {
      ok: false,
      successCount: 0,
      skippedCount: 0,
      failedCount: unique.length,
      successIds: [],
      items: unique.map((articleId) => ({
        articleId,
        ok: false,
        reason: "update_failed",
        message: fetchError.message,
      })),
      error: fetchError.message,
      step: "fetch",
    };
  }

  const articleById = new Map<string, ArticleRow>(
    ((articles ?? []) as ArticleRow[]).map((row) => [row.id, row])
  );

  const { data: locs, error: locError } = await client
    .from("article_localizations")
    .select("article_id, locale, slug")
    .in("article_id", unique);

  if (locError) {
    return {
      ok: false,
      successCount: 0,
      skippedCount: 0,
      failedCount: unique.length,
      successIds: [],
      items: unique.map((articleId) => ({
        articleId,
        ok: false,
        reason: "update_failed",
        message: locError.message,
      })),
      error: locError.message,
      step: "localizations",
    };
  }

  const locMeta = new Map<
    string,
    { hasKo: boolean; hasEn: boolean; koSlug: string | null; enSlug: string | null }
  >();
  for (const loc of (locs ?? []) as LocRow[]) {
    const cur = locMeta.get(loc.article_id) ?? {
      hasKo: false,
      hasEn: false,
      koSlug: null,
      enSlug: null,
    };
    if (loc.locale === "ko") {
      cur.hasKo = true;
      cur.koSlug = loc.slug;
    }
    if (loc.locale === "en") {
      cur.hasEn = true;
      cur.enSlug = loc.slug;
    }
    locMeta.set(loc.article_id, cur);
  }

  const patch = buildRestorePublishedFromRevisionUpdate();
  const items: RestorePublishedItemResult[] = [];
  const successIds: string[] = [];

  for (const articleId of unique) {
    const row = articleById.get(articleId);
    if (!row) {
      items.push({
        articleId,
        ok: false,
        reason: "not_found",
        message: restorePublishedFailReasonLabel("not_found"),
      });
      continue;
    }

    const meta = locMeta.get(articleId) ?? {
      hasKo: false,
      hasEn: false,
      koSlug: null,
      enSlug: null,
    };

    const eligibility = evaluateRestorePublishedEligibility({
      id: row.id,
      status: row.status,
      review_status: row.review_status,
      revision_status: row.revision_status,
      is_published: row.is_published,
      published_at: row.published_at,
      hasKoLocalization: meta.hasKo,
      hasEnLocalization: meta.hasEn,
    });

    if (!eligibility.ok) {
      items.push({
        articleId,
        ok: false,
        reason: eligibility.reason,
        message: restorePublishedFailReasonLabel(eligibility.reason),
        publishedAt: row.published_at,
        koSlug: meta.koSlug,
        enSlug: meta.enSlug,
      });
      continue;
    }

    // Conditional update: only while still in full revision state — idempotent / race-safe.
    const { data: updated, error: updateError } = await client
      .from("articles")
      .update(patch)
      .eq("id", articleId)
      .eq("status", "needs_revision")
      .eq("review_status", "needs_revision")
      .eq("revision_status", "requested")
      .eq("is_published", false)
      .not("published_at", "is", null)
      .select("id, published_at")
      .maybeSingle();

    if (updateError) {
      items.push({
        articleId,
        ok: false,
        reason: "update_failed",
        message: updateError.message,
        publishedAt: row.published_at,
        koSlug: meta.koSlug,
        enSlug: meta.enSlug,
      });
      continue;
    }

    if (!updated) {
      // Re-check: already restored by a concurrent request → treat as success.
      const { data: again } = await client
        .from("articles")
        .select("id, status, is_published, published_at")
        .eq("id", articleId)
        .maybeSingle();

      if (
        again &&
        again.is_published === true &&
        again.status === "published" &&
        again.published_at
      ) {
        successIds.push(articleId);
        items.push({
          articleId,
          ok: true,
          message: "이미 공개 상태로 복구되어 있습니다.",
          publishedAt: again.published_at,
          koSlug: meta.koSlug,
          enSlug: meta.enSlug,
        });
        continue;
      }

      items.push({
        articleId,
        ok: false,
        reason: "race",
        message: "상태 변경에 실패했습니다. 다시 시도해 주세요.",
        publishedAt: row.published_at,
        koSlug: meta.koSlug,
        enSlug: meta.enSlug,
      });
      continue;
    }

    successIds.push(articleId);
    items.push({
      articleId,
      ok: true,
      message: "이전 공개 상태로 복구했습니다.",
      publishedAt: updated.published_at ?? row.published_at,
      koSlug: meta.koSlug,
      enSlug: meta.enSlug,
    });
  }

  const successCount = items.filter((i) => i.ok).length;
  const { skippedCount, failedCount } = summarizeRestoreItemOutcomes(items);

  return {
    ok: successCount > 0,
    successCount,
    skippedCount,
    failedCount,
    successIds,
    items,
  };
}
