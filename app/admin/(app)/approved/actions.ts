"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { publishArticleToLive } from "@/lib/articles/publishArticle";
import { revalidateAdminNavCountsCache } from "@/lib/admin/revalidateAdminNav";

function getArticleIdsFromFormData(formData: FormData) {
  return formData
    .getAll("articleIds")
    .map((value) => String(value))
    .filter(Boolean);
}

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

/**
 * Form action for single publish from /admin/approved.
 * SAME EVENT blocks redirect with guidance + override — never Application error.
 */
export async function publishArticleFromForm(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "").trim();
  if (!articleId) {
    redirect(approvedListPath({ error: "missing" }));
  }

  const override =
    String(formData.get("allowSameEventOverride") ?? "").trim() === "1";

  const result = await publishArticleToLive(articleId, {
    allowSameEventOverride: override,
  });

  if (!result.ok) {
    if (result.step === "same_event_guard" && result.sameEventMatch) {
      redirect(
        approvedListPath({
          sameEvent: "1",
          articleId,
          matchId: result.sameEventMatch.id,
          matchTitle: result.sameEventMatch.title.slice(0, 160),
          matchSource: result.sameEventMatch.source,
          matchPublishedAt: result.sameEventMatch.publishedAt || "",
        })
      );
    }
    redirect(
      approvedListPath({
        articleId,
        error: result.error.slice(0, 200),
      })
    );
  }

  revalidatePublishPages();
  redirect(`/admin/published?published=${articleId}`);
}

/** @deprecated Prefer publishArticleFromForm — kept for any direct callers. */
export async function publishArticle(
  articleId: string,
  options?: { allowSameEventOverride?: boolean }
) {
  const result = await publishArticleToLive(articleId, {
    allowSameEventOverride: options?.allowSameEventOverride === true,
  });
  if (!result.ok) {
    if (result.step === "same_event_guard" && result.sameEventMatch) {
      redirect(
        approvedListPath({
          sameEvent: "1",
          articleId,
          matchId: result.sameEventMatch.id,
          matchTitle: result.sameEventMatch.title.slice(0, 160),
          matchSource: result.sameEventMatch.source,
          matchPublishedAt: result.sameEventMatch.publishedAt || "",
        })
      );
    }
    throw new Error(result.error);
  }
  revalidatePublishPages();
}

export async function bulkPublishArticles(formData: FormData) {
  const articleIds = getArticleIdsFromFormData(formData);

  if (articleIds.length === 0) return;

  for (const articleId of articleIds) {
    const result = await publishArticleToLive(articleId);
    if (!result.ok) {
      if (result.step === "same_event_guard" && result.sameEventMatch) {
        redirect(
          approvedListPath({
            sameEvent: "1",
            articleId,
            matchId: result.sameEventMatch.id,
            matchTitle: result.sameEventMatch.title.slice(0, 160),
            matchSource: result.sameEventMatch.source,
            matchPublishedAt: result.sameEventMatch.publishedAt || "",
            bulkError: "1",
          })
        );
      }
      redirect(
        approvedListPath({
          articleId,
          error: result.error.slice(0, 200),
          bulkError: "1",
        })
      );
    }
  }

  revalidatePublishPages();
  redirect(`/admin/published?bulkPublished=${articleIds.length}`);
}
