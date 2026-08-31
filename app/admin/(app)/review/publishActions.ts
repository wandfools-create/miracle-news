"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { reviewCompleteAndPublishArticle } from "@/lib/articles/publishArticle";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
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
  const nextArticleId = String(formData.get("nextArticleId") ?? "").trim();
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

  if (nextArticleId) {
    redirect(mobileReviewUrl(nextArticleId, { published: articleId }));
  }
  redirect("/admin/review/mobile?published=1");
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
