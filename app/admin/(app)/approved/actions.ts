"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  encodeApprovedBulkPublishPayload,
  summarizeApprovedBulkPublish,
  type ApprovedBulkPublishItemResult,
} from "@/lib/admin/approvedBulkPublish";
import {
  isValidArticleUuid,
  parseApprovedPublishArticleIds,
} from "@/lib/admin/approvedPublishIds";
import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { revalidateAdminNavCountsCache } from "@/lib/admin/revalidateAdminNav";
import { publishApprovedArticleToLive } from "@/lib/articles/publishApprovedArticle";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function revalidatePublishPages() {
  revalidateAdminNavCountsCache();
  revalidatePath("/admin/approved");
  revalidatePath("/admin/published");
  revalidatePath("/admin/review");
  revalidatePath("/admin/quick-review");
  revalidatePath("/ko");
  revalidatePath("/en");
}

function approvedListPath(extra?: Record<string, string>) {
  const params = new URLSearchParams();
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  const q = params.toString();
  return q ? `/admin/approved?${q}` : "/admin/approved";
}

function sanitizePublishError(error: string, step: string): string {
  const lower = error.toLowerCase();
  if (
    lower.includes("password") ||
    lower.includes("secret") ||
    lower.includes("service_role") ||
    lower.includes("apikey")
  ) {
    return "공개 처리 중 오류가 발생했습니다.";
  }
  if (step === "fetch" || step === "publish_update" || step === "localizations") {
    return "공개 처리 중 오류가 발생했습니다.";
  }
  return error.slice(0, 200);
}

async function requireAdmin() {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user || !isAllowedAdminEmail(user.email)) {
    return null;
  }
  return user;
}

function displayTitle(article: {
  title_ko?: string | null;
  title_translated?: string | null;
  title_original?: string | null;
}): string {
  return (
    article.title_ko ||
    article.title_translated ||
    article.title_original ||
    "제목 없음"
  );
}

/**
 * 승인 완료 큐: 인증된 관리자의 명시적 공개는 최종 사람 결정.
 * SAME EVENT hard block 없음 (publish result metadata만).
 */
export async function publishArticleFromForm(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "").trim();
  if (!articleId || !isValidArticleUuid(articleId)) {
    redirect(approvedListPath({ error: "missing" }));
  }

  const user = await requireAdmin();
  if (!user) {
    redirect("/admin/login?next=/admin/approved");
  }

  const result = await publishApprovedArticleToLive(articleId);

  if (!result.ok) {
    redirect(
      approvedListPath({
        articleId,
        error: sanitizePublishError(result.error, result.step),
        step: result.step,
      })
    );
  }

  revalidatePublishPages();
  redirect(`/admin/published?published=${articleId}`);
}

/** @deprecated Prefer publishArticleFromForm — kept for any direct callers. */
export async function publishArticle(articleId: string) {
  const user = await requireAdmin();
  if (!user) {
    throw new Error("관리자 인증이 필요합니다.");
  }

  if (!isValidArticleUuid(articleId)) {
    throw new Error("유효하지 않은 기사 ID입니다.");
  }

  const result = await publishApprovedArticleToLive(articleId);
  if (!result.ok) {
    throw new Error(result.error);
  }
  revalidatePublishPages();
}

export async function bulkPublishArticles(formData: FormData) {
  const user = await requireAdmin();
  if (!user) {
    redirect("/admin/login?next=/admin/approved");
  }

  const { ids: articleIds, invalidCount, truncatedCount } =
    parseApprovedPublishArticleIds(formData);

  if (articleIds.length === 0 && invalidCount === 0) {
    redirect(approvedListPath({ error: "선택된 기사가 없습니다." }));
  }

  const results: ApprovedBulkPublishItemResult[] = [];

  if (invalidCount > 0) {
    results.push({
      id: "invalid",
      ok: false,
      step: "excluded",
      error: `유효하지 않은 ID ${invalidCount}건`,
      excluded: true,
    });
  }
  if (truncatedCount > 0) {
    results.push({
      id: "limit",
      ok: false,
      step: "excluded",
      error: `상한 초과로 ${truncatedCount}건 미처리`,
      excluded: true,
    });
  }

  for (const articleId of articleIds) {
    const result = await publishApprovedArticleToLive(articleId);

    if (result.ok) {
      results.push({
        id: articleId,
        ok: true,
        title: articleId,
        alreadyPublished: !result.firstPublish,
        sameEventNote: result.sameEventPublishResultMetadata?.wouldHaveBlocked
          ? result.sameEventPublishResultMetadata.match
          : undefined,
      });
      continue;
    }

    results.push({
      id: articleId,
      ok: false,
      title: articleId,
      step: result.step,
      error: sanitizePublishError(result.error, result.step),
      excluded: result.step === "excluded",
    });
  }

  const authClient = await createSupabaseServerClient();
  const { data: rows } = await authClient
    .from("articles")
    .select("id, title_ko, title_translated, title_original")
    .in("id", articleIds);

  const titleById = new Map(
    (rows ?? []).map((r) => [
      r.id as string,
      displayTitle(r as Parameters<typeof displayTitle>[0]),
    ])
  );

  for (const r of results) {
    if (r.id === "invalid" || r.id === "limit") continue;
    if (titleById.has(r.id)) {
      if (r.ok) r.title = titleById.get(r.id)!;
      else r.title = titleById.get(r.id);
    }
  }

  const summary = summarizeApprovedBulkPublish(results);
  revalidatePublishPages();

  const payload = encodeApprovedBulkPublishPayload(summary);
  redirect(
    approvedListPath({
      batchPublish: "1",
      batchPayload: payload,
    })
  );
}
