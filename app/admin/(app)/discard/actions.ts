"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  buildDiscardArticleUpdate,
  buildRestoreDiscardedArticleUpdate,
  evaluateDiscardEligibility,
  evaluateRestoreEligibility,
  partitionDiscardCandidates,
} from "@/lib/admin/discardArticles";
import { supabase } from "@/lib/supabase";

export type DiscardArticlesResult = {
  ok: boolean;
  discardedCount: number;
  skippedCount: number;
  skippedPublished: number;
  skippedOther: number;
  error?: string;
};

function getArticleIdsFromFormData(formData: FormData): string[] {
  const multi = formData
    .getAll("articleIds")
    .map((value) => String(value).trim())
    .filter(Boolean);
  if (multi.length > 0) return [...new Set(multi)];

  const single = String(formData.get("articleId") ?? "").trim();
  return single ? [single] : [];
}

function getReturnPath(formData: FormData): string {
  const from = String(formData.get("from") ?? "").trim();
  if (from === "revision") return "/admin/revision";
  if (from === "archive") return "/admin/archive?tab=articles";
  return "/admin/on-hold";
}

function revalidateDiscardPaths(articleIds: string[] = []) {
  revalidatePath("/admin/on-hold");
  revalidatePath("/admin/revision");
  revalidatePath("/admin/review");
  revalidatePath("/admin/approved");
  revalidatePath("/admin/published");
  revalidatePath("/admin/archive");
  revalidatePath("/admin/quick-review");
  revalidatePath("/admin");
  for (const id of articleIds) {
    revalidatePath(`/admin/review/${id}`);
  }
}

/**
 * Soft-discard selected on-hold / revision articles → archived.
 * Never DELETE. Never touches published live articles.
 */
export async function discardArticlesAction(
  formData: FormData
): Promise<void> {
  const returnPath = getReturnPath(formData);
  const articleIds = getArticleIdsFromFormData(formData);

  if (articleIds.length === 0) {
    redirect(`${returnPath}?discardError=${encodeURIComponent("선택된 기사가 없습니다.")}`);
  }

  const { data, error } = await supabase
    .from("articles")
    .select("id, status, review_status, is_published")
    .in("id", articleIds);

  if (error) {
    redirect(
      `${returnPath}?discardError=${encodeURIComponent(error.message)}`
    );
  }

  const rows = data ?? [];
  const foundIds = new Set(rows.map((r) => r.id));
  const missing = articleIds.filter((id) => !foundIds.has(id)).length;

  const { discardable, blocked } = partitionDiscardCandidates(rows);
  const skippedPublished = blocked.filter(
    (b) => b.blockReason.reason === "published"
  ).length;
  const skippedOther = blocked.length - skippedPublished + missing;

  if (discardable.length === 0) {
    redirect(
      `${returnPath}?discarded=0&skipped=${blocked.length + missing}&discardError=${encodeURIComponent(
        skippedPublished > 0
          ? "공개 기사는 폐기할 수 없습니다."
          : "폐기할 수 있는 기사가 없습니다."
      )}`
    );
  }

  const discardIds = discardable.map((r) => r.id);
  const update = buildDiscardArticleUpdate();

  const { data: updated, error: updateError } = await supabase
    .from("articles")
    .update(update)
    .in("id", discardIds)
    .eq("is_published", false)
    .neq("status", "published")
    .in("review_status", ["on_hold", "needs_revision"])
    .select("id");

  if (updateError) {
    redirect(
      `${returnPath}?discardError=${encodeURIComponent(updateError.message)}`
    );
  }

  const discardedCount = updated?.length ?? 0;
  const updateMiss =
    discardIds.length - discardedCount + skippedOther + skippedPublished;

  revalidateDiscardPaths(discardIds);

  const params = new URLSearchParams();
  params.set("discarded", String(discardedCount));
  if (updateMiss > 0) params.set("skipped", String(updateMiss));
  if (discardedCount < discardIds.length || skippedPublished > 0) {
    params.set(
      "discardError",
      discardedCount === 0
        ? "폐기 처리에 실패했습니다."
        : `일부만 폐기됨 (${discardedCount}건 성공).`
    );
  }

  redirect(`${returnPath}?${params.toString()}`);
}

/** Restore archived (폐기) article to pending review — never publish. */
export async function restoreDiscardedArticleAction(
  formData: FormData
): Promise<void> {
  const articleId = String(formData.get("articleId") ?? "").trim();
  if (!articleId) {
    redirect(
      `/admin/archive?tab=articles&restoreError=${encodeURIComponent("기사 ID가 없습니다.")}`
    );
  }

  const { data, error } = await supabase
    .from("articles")
    .select("id, status, review_status, is_published")
    .eq("id", articleId)
    .maybeSingle();

  if (error) {
    redirect(
      `/admin/archive?tab=articles&restoreError=${encodeURIComponent(error.message)}`
    );
  }
  if (!data) {
    redirect(
      `/admin/archive?tab=articles&restoreError=${encodeURIComponent("기사를 찾을 수 없습니다.")}`
    );
  }

  const eligibility = evaluateRestoreEligibility(data);
  if (!eligibility.ok) {
    redirect(
      `/admin/archive?tab=articles&restoreError=${encodeURIComponent(
        eligibility.reason === "published"
          ? "공개 기사는 이 경로로 복구할 수 없습니다."
          : "폐기(보관) 상태가 아닌 기사입니다."
      )}`
    );
  }

  const { error: updateError } = await supabase
    .from("articles")
    .update(buildRestoreDiscardedArticleUpdate())
    .eq("id", articleId)
    .eq("status", "archived")
    .eq("review_status", "archived")
    .eq("is_published", false);

  if (updateError) {
    redirect(
      `/admin/archive?tab=articles&restoreError=${encodeURIComponent(updateError.message)}`
    );
  }

  revalidateDiscardPaths([articleId]);
  redirect("/admin/review?restored=1");
}

/** Programmatic helper for tests / callers that need a result object. */
export async function discardArticlesByIds(
  articleIds: string[]
): Promise<DiscardArticlesResult> {
  const unique = [...new Set(articleIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return {
      ok: false,
      discardedCount: 0,
      skippedCount: 0,
      skippedPublished: 0,
      skippedOther: 0,
      error: "no_ids",
    };
  }

  const { data, error } = await supabase
    .from("articles")
    .select("id, status, review_status, is_published")
    .in("id", unique);

  if (error) {
    return {
      ok: false,
      discardedCount: 0,
      skippedCount: unique.length,
      skippedPublished: 0,
      skippedOther: unique.length,
      error: error.message,
    };
  }

  const rows = data ?? [];
  const { discardable, blocked } = partitionDiscardCandidates(rows);
  const skippedPublished = blocked.filter(
    (b) => b.blockReason.reason === "published"
  ).length;
  const missing = unique.length - rows.length;
  const skippedOther =
    blocked.length - skippedPublished + missing;

  if (discardable.length === 0) {
    return {
      ok: false,
      discardedCount: 0,
      skippedCount: blocked.length + missing,
      skippedPublished,
      skippedOther,
      error: skippedPublished > 0 ? "published_blocked" : "none_discardable",
    };
  }

  const discardIds = discardable.map((r) => r.id);
  // Guard: double-check each id is still eligible (defensive)
  for (const row of discardable) {
    const again = evaluateDiscardEligibility(row);
    if (!again.ok) {
      return {
        ok: false,
        discardedCount: 0,
        skippedCount: unique.length,
        skippedPublished,
        skippedOther: unique.length - skippedPublished,
        error: "eligibility_changed",
      };
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("articles")
    .update(buildDiscardArticleUpdate())
    .in("id", discardIds)
    .eq("is_published", false)
    .neq("status", "published")
    .in("review_status", ["on_hold", "needs_revision"])
    .select("id");

  if (updateError) {
    return {
      ok: false,
      discardedCount: 0,
      skippedCount: unique.length,
      skippedPublished,
      skippedOther,
      error: updateError.message,
    };
  }

  const discardedCount = updated?.length ?? 0;
  revalidateDiscardPaths(discardIds);

  return {
    ok: discardedCount > 0,
    discardedCount,
    skippedCount: unique.length - discardedCount,
    skippedPublished,
    skippedOther: unique.length - discardedCount - skippedPublished,
  };
}
