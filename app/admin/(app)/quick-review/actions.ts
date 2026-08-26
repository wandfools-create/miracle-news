"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  holdQuickReviewArticle,
  quickPublishArticle,
  sendQuickReviewToReviewQueue,
} from "@/lib/articles/publishArticle";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";

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

function revalidateQuickReviewPaths(articleId?: string) {
  revalidatePath("/admin/quick-review");
  revalidatePath("/admin/review");
  revalidatePath("/admin/approved");
  revalidatePath("/admin/published");
  revalidatePath("/admin/on-hold");
  revalidatePath("/ko");
  revalidatePath("/en");
  if (articleId) {
    revalidatePath(`/admin/quick-review/${articleId}`);
    revalidatePath(`/admin/review/${articleId}`);
  }
}

/** ✅ 확인 후 바로 공개 — atomic approve+publish, no OpenAI. */
export async function quickPublishFromForm(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "").trim();
  if (!articleId) {
    redirect("/admin/quick-review?error=missing");
  }

  const user = await requireAdmin();
  if (!user) {
    redirect("/admin/login");
  }

  const override =
    String(formData.get("allowSameEventOverride") ?? "").trim() === "1";

  const result = await quickPublishArticle(articleId, {
    allowSameEventOverride: override,
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
      redirect(`/admin/quick-review/${articleId}?${q.toString()}`);
    }
    const msg = encodeURIComponent(result.error.slice(0, 200));
    redirect(`/admin/quick-review/${articleId}?error=${msg}`);
  }

  revalidateQuickReviewPaths(articleId);
  redirect(`/admin/published?quickPublished=${articleId}`);
}

/** ✏️ 수정 필요 → 검토 대기. No OpenAI. */
export async function sendQuickReviewToQueueFromForm(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "").trim();
  if (!articleId) {
    redirect("/admin/quick-review?error=missing");
  }

  const user = await requireAdmin();
  if (!user) {
    redirect("/admin/login");
  }

  const result = await sendQuickReviewToReviewQueue(articleId);
  if (!result.ok) {
    redirect(
      `/admin/quick-review/${articleId}?error=${encodeURIComponent(result.error)}`
    );
  }

  revalidateQuickReviewPaths(articleId);
  redirect(`/admin/review/${articleId}?from=quick`);
}

/** ❌ 보류. No OpenAI. */
export async function holdQuickReviewFromForm(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "").trim();
  if (!articleId) {
    redirect("/admin/quick-review?error=missing");
  }

  const user = await requireAdmin();
  if (!user) {
    redirect("/admin/login");
  }

  const result = await holdQuickReviewArticle(articleId);
  if (!result.ok) {
    redirect(
      `/admin/quick-review/${articleId}?error=${encodeURIComponent(result.error)}`
    );
  }

  revalidateQuickReviewPaths(articleId);
  redirect("/admin/on-hold?from=quick");
}
