/**
 * Soft-discard articles (on_hold / needs_revision / rejected) → archived.
 * Uses service role so RLS cannot silently no-op updates.
 * No DELETE. No OpenAI.
 */

import "server-only";

import {
  buildDiscardArticleUpdate,
  buildRestoreDiscardedArticleUpdate,
  evaluateDiscardEligibility,
  evaluateRestoreEligibility,
  partitionDiscardCandidates,
  type DiscardEligibilityInput,
} from "@/lib/admin/discardArticles";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

export type DiscardArticlesCoreResult = {
  ok: boolean;
  discardedIds: string[];
  discardedCount: number;
  skippedPublished: number;
  skippedOther: number;
  skippedIds: string[];
  failedCount: number;
  error?: string;
  step?: string;
};

export type RestoreDiscardedCoreResult =
  | { ok: true; articleId: string }
  | { ok: false; error: string; step: string };

const DISCARDABLE_REVIEW = [
  "on_hold",
  "needs_revision",
  "rejected",
] as const;

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

/**
 * Soft-archive eligible articles. count=0 is never treated as success.
 */
export async function discardArticlesCore(
  articleIds: string[]
): Promise<DiscardArticlesCoreResult> {
  const unique = uniqueIds(articleIds);
  if (unique.length === 0) {
    return {
      ok: false,
      discardedIds: [],
      discardedCount: 0,
      skippedPublished: 0,
      skippedOther: 0,
      skippedIds: [],
      failedCount: 0,
      error: "선택된 기사가 없습니다.",
      step: "validation",
    };
  }

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return {
      ok: false,
      discardedIds: [],
      discardedCount: 0,
      skippedPublished: 0,
      skippedOther: unique.length,
      skippedIds: unique,
      failedCount: unique.length,
      error: envCheck.error,
      step: envCheck.step,
    };
  }

  const { client } = createServiceRoleSupabaseClient();

  const { data, error } = await client
    .from("articles")
    .select("id, status, review_status, is_published, is_top_story")
    .in("id", unique);

  if (error) {
    return {
      ok: false,
      discardedIds: [],
      discardedCount: 0,
      skippedPublished: 0,
      skippedOther: unique.length,
      skippedIds: unique,
      failedCount: unique.length,
      error: error.message,
      step: "fetch_articles",
    };
  }

  const rows = (data ?? []) as Array<
    DiscardEligibilityInput & {
      id: string;
      is_top_story?: boolean | null;
    }
  >;

  const foundIds = new Set(rows.map((r) => r.id));
  const missingIds = unique.filter((id) => !foundIds.has(id));

  // Protect top stories even on hold/revision
  const topStoryBlocked = rows.filter((r) => r.is_top_story === true);
  const nonTop = rows.filter((r) => r.is_top_story !== true);

  const { discardable, blocked } = partitionDiscardCandidates(nonTop);
  const skippedPublished = blocked.filter(
    (b) => b.blockReason.reason === "published"
  ).length;
  const skippedOtherBlocked = blocked.length - skippedPublished;
  const skippedIds = [
    ...missingIds,
    ...topStoryBlocked.map((r) => r.id),
    ...blocked.map((b) => b.id).filter(Boolean),
  ] as string[];

  if (discardable.length === 0) {
    const reason =
      skippedPublished > 0
        ? "공개 기사는 폐기할 수 없습니다."
        : topStoryBlocked.length > 0
          ? "메인 탑스토리 기사는 폐기할 수 없습니다."
          : "폐기할 수 있는 기사가 없습니다. (보류/수정 대기/반려만 가능)";
    return {
      ok: false,
      discardedIds: [],
      discardedCount: 0,
      skippedPublished,
      skippedOther:
        skippedOtherBlocked + missingIds.length + topStoryBlocked.length,
      skippedIds,
      failedCount: 0,
      error: reason,
      step: "eligibility",
    };
  }

  const discardIds = discardable.map((r) => r.id);
  const updatePayload = buildDiscardArticleUpdate();

  const { data: updated, error: updateError } = await client
    .from("articles")
    .update(updatePayload)
    .in("id", discardIds)
    .eq("is_published", false)
    .neq("status", "published")
    .in("review_status", [...DISCARDABLE_REVIEW])
    .or("is_top_story.is.null,is_top_story.eq.false")
    .select("id, status, review_status, is_published");

  if (updateError) {
    return {
      ok: false,
      discardedIds: [],
      discardedCount: 0,
      skippedPublished,
      skippedOther:
        skippedOtherBlocked +
        missingIds.length +
        topStoryBlocked.length +
        discardIds.length,
      skippedIds: [...skippedIds, ...discardIds],
      failedCount: discardIds.length,
      error: updateError.message,
      step: "update",
    };
  }

  const confirmed = (updated ?? []).filter(
    (row) =>
      row.status === "archived" &&
      row.review_status === "archived" &&
      row.is_published === false
  );
  const discardedIds = confirmed.map((r) => r.id);
  const discardedCount = discardedIds.length;
  const updateMissIds = discardIds.filter((id) => !discardedIds.includes(id));

  if (discardedCount === 0) {
    return {
      ok: false,
      discardedIds: [],
      discardedCount: 0,
      skippedPublished,
      skippedOther:
        skippedOtherBlocked +
        missingIds.length +
        topStoryBlocked.length +
        discardIds.length,
      skippedIds: [...skippedIds, ...discardIds],
      failedCount: discardIds.length,
      error:
        "DB 업데이트가 0건이었습니다. (권한/조건 불일치) 폐기되지 않았습니다.",
      step: "update_zero",
    };
  }

  return {
    ok: true,
    discardedIds,
    discardedCount,
    skippedPublished,
    skippedOther:
      skippedOtherBlocked +
      missingIds.length +
      topStoryBlocked.length +
      updateMissIds.length,
    skippedIds: [...skippedIds, ...updateMissIds],
    failedCount: updateMissIds.length,
    error:
      updateMissIds.length > 0
        ? `일부만 폐기됨 (${discardedCount}건 성공, ${updateMissIds.length}건 실패).`
        : undefined,
    step: updateMissIds.length > 0 ? "partial" : "ok",
  };
}

export async function restoreDiscardedArticleCore(
  articleIdRaw: string
): Promise<RestoreDiscardedCoreResult> {
  const articleId = articleIdRaw.trim();
  if (!articleId) {
    return { ok: false, error: "기사 ID가 없습니다.", step: "validation" };
  }

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error, step: envCheck.step };
  }

  const { client } = createServiceRoleSupabaseClient();

  const { data, error } = await client
    .from("articles")
    .select("id, status, review_status, is_published")
    .eq("id", articleId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message, step: "fetch" };
  }
  if (!data) {
    return { ok: false, error: "기사를 찾을 수 없습니다.", step: "fetch" };
  }

  const eligibility = evaluateRestoreEligibility(data);
  if (!eligibility.ok) {
    return {
      ok: false,
      error:
        eligibility.reason === "published"
          ? "공개 기사는 이 경로로 복구할 수 없습니다."
          : "폐기(보관) 상태가 아닌 기사입니다.",
      step: "eligibility",
    };
  }

  const { data: updated, error: updateError } = await client
    .from("articles")
    .update(buildRestoreDiscardedArticleUpdate())
    .eq("id", articleId)
    .eq("status", "archived")
    .eq("review_status", "archived")
    .eq("is_published", false)
    .select("id, status, review_status, is_published");

  if (updateError) {
    return { ok: false, error: updateError.message, step: "update" };
  }

  const row = updated?.[0];
  if (
    !row ||
    row.status !== "ready_for_human_review" ||
    row.review_status !== "pending"
  ) {
    return {
      ok: false,
      error: "복구 업데이트가 0건이었습니다.",
      step: "update_zero",
    };
  }

  return { ok: true, articleId };
}
