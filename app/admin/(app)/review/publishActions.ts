"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  encodeApprovedBulkPublishPayload,
  summarizeApprovedBulkPublish,
  type ApprovedBulkPublishItemResult,
} from "@/lib/admin/approvedBulkPublish";
import { parseApprovedPublishArticleIds } from "@/lib/admin/approvedPublishIds";
import { reviewCompleteAndPublishArticle } from "@/lib/articles/publishArticle";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { fetchNextPendingReviewArticleIdAfterPublish } from "@/lib/admin/fetchMobileReviewNeighbors";
import { revalidateAdminNavCountsCache } from "@/lib/admin/revalidateAdminNav";
import {
  holdArticle,
  rejectArticle,
  requestRevision,
} from "./[id]/actions";

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

function revalidateReviewPaths(articleId?: string) {
  revalidateAdminNavCountsCache();
  revalidatePath("/admin/review");
  revalidatePath("/admin/review/mobile");
  revalidatePath("/admin/approved");
  revalidatePath("/admin/published");
  revalidatePath("/admin/revision");
  revalidatePath("/admin/on-hold");
  revalidatePath("/admin/rejected");
  revalidatePath("/ko");
  revalidatePath("/en");
  if (articleId) {
    revalidatePath(`/admin/review/${articleId}`);
    revalidatePath(`/admin/review/mobile/${articleId}`);
  }
}

function mobileReviewUrl(
  articleId: string,
  params?: Record<string, string>
): string {
  const q = params ? `?${new URLSearchParams(params).toString()}` : "";
  return `/admin/review/mobile/${articleId}${q}`;
}

/** 검토 완료 및 공개 — approve+publish from pending review (explicit admin click). */
export async function reviewCompleteAndPublishFromForm(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "mobile").trim();
  // Client nextArticleId is ignored for post-publish navigation (re-queried server-side).
  if (!articleId) {
    redirect("/admin/review/mobile?error=missing");
  }

  const user = await requireAdmin();
  if (!user) {
    redirect("/admin/login");
  }

  const override =
    String(formData.get("allowSameEventOverride") ?? "").trim() === "1";

  const result = await reviewCompleteAndPublishArticle(articleId, {
    allowSameEventOverride: override,
    approvedBy: user.email ?? "admin",
  });

  if (!result.ok) {
    if (result.step === "same_event_guard" && result.sameEventMatch) {
      const q = new URLSearchParams({
        sameEvent: "1",
        matchId: result.sameEventMatch.id,
        matchTitle: result.sameEventMatch.title.slice(0, 160),
        matchSource: result.sameEventMatch.source,
        matchPublishedAt: result.sameEventMatch.publishedAt || "",
      });
      redirect(
        returnTo === "detail"
          ? `/admin/review/${articleId}?${q.toString()}`
          : mobileReviewUrl(articleId, Object.fromEntries(q))
      );
    }
    const msg = encodeURIComponent(result.error.slice(0, 200));
    redirect(
      returnTo === "detail"
        ? `/admin/review/${articleId}?error=${msg}`
        : mobileReviewUrl(articleId, { error: result.error.slice(0, 200) })
    );
  }

  revalidateReviewPaths(articleId);

  if (returnTo === "detail") {
    redirect(`/admin/published?reviewPublished=${articleId}`);
  }

  const nextArticleId =
    await fetchNextPendingReviewArticleIdAfterPublish(articleId);
  if (nextArticleId) {
    redirect(mobileReviewUrl(nextArticleId, { published: articleId }));
  }
  redirect("/admin/review/mobile?published=1");
}

/** Selected pending-review articles: validate and publish each through the atomic RPC. */
export async function bulkReviewCompleteAndPublishFromForm(formData: FormData) {
  const user = await requireAdmin();
  if (!user) redirect("/admin/login?next=/admin/review");

  const { ids, invalidCount, truncatedCount } =
    parseApprovedPublishArticleIds(formData);
  if (ids.length === 0 && invalidCount === 0) {
    redirect("/admin/review?error=no_selection");
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

  for (const articleId of ids) {
    const result = await reviewCompleteAndPublishArticle(articleId, {
      approvedBy: user.email ?? "admin",
    });
    if (result.ok) {
      results.push({
        id: articleId,
        ok: true,
        title: articleId,
        alreadyPublished: !result.firstPublish,
      });
    } else {
      results.push({
        id: articleId,
        ok: false,
        step: result.step,
        error: result.error.slice(0, 200),
        excluded: result.step === "status_guard",
      });
    }
  }

  const authClient = await createSupabaseServerClient();
  const { data: rows } = await authClient
    .from("articles")
    .select("id, title_ko, title_translated, title_original")
    .in("id", ids);
  const titleById = new Map(
    (rows ?? []).map((row) => [
      row.id as string,
      row.title_ko || row.title_translated || row.title_original || row.id,
    ])
  );
  for (const item of results) {
    const title = titleById.get(item.id);
    if (title) item.title = title;
  }

  revalidateReviewPaths();
  const payload = encodeApprovedBulkPublishPayload(
    summarizeApprovedBulkPublish(results)
  );
  redirect(`/admin/review?batchPublish=1&batchPayload=${payload}`);
}

export async function mobileHoldFromForm(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "").trim();
  const nextArticleId = String(formData.get("nextArticleId") ?? "").trim();
  if (!articleId) redirect("/admin/review/mobile?error=missing");

  const user = await requireAdmin();
  if (!user) redirect("/admin/login");

  await holdArticle(articleId);
  revalidateReviewPaths(articleId);

  if (nextArticleId) {
    redirect(mobileReviewUrl(nextArticleId));
  }
  redirect("/admin/on-hold?from=mobile-review");
}

export async function mobileRejectFromForm(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "").trim();
  const reason = String(formData.get("rejectedReason") ?? "").trim();
  const nextArticleId = String(formData.get("nextArticleId") ?? "").trim();
  if (!articleId) redirect("/admin/review/mobile?error=missing");
  if (!reason) {
    redirect(
      mobileReviewUrl(articleId, { error: "반려 사유를 입력해 주세요." })
    );
  }

  const user = await requireAdmin();
  if (!user) redirect("/admin/login");

  await rejectArticle(articleId, reason);
  revalidateReviewPaths(articleId);

  if (nextArticleId) {
    redirect(mobileReviewUrl(nextArticleId));
  }
  redirect("/admin/rejected?from=mobile-review");
}

export async function mobileRequestRevisionFromForm(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "").trim();
  const note = String(formData.get("feedbackNote") ?? "").trim();
  const nextArticleId = String(formData.get("nextArticleId") ?? "").trim();
  if (!articleId) redirect("/admin/review/mobile?error=missing");
  if (!note) {
    redirect(
      mobileReviewUrl(articleId, { error: "수정 요청 내용을 입력해 주세요." })
    );
  }

  const user = await requireAdmin();
  if (!user) redirect("/admin/login");

  await requestRevision(articleId, "editorial", note);
  revalidateReviewPaths(articleId);

  if (nextArticleId) {
    redirect(mobileReviewUrl(nextArticleId));
  }
  redirect("/admin/revision?from=mobile-review");
}

/** Desktop review detail — same publish action, returns to published list. */
export async function reviewCompleteAndPublishDetailFromForm(
  formData: FormData
) {
  formData.set("returnTo", "detail");
  return reviewCompleteAndPublishFromForm(formData);
}
