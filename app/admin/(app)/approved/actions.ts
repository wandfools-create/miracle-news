"use server";

import { revalidatePath } from "next/cache";
import { publishArticleToLive } from "@/lib/articles/publishArticle";

function getArticleIdsFromFormData(formData: FormData) {
  return formData
    .getAll("articleIds")
    .map((value) => String(value))
    .filter(Boolean);
}

function revalidatePublishPages() {
  revalidatePath("/admin/approved");
  revalidatePath("/admin/published");
  revalidatePath("/admin/review");
  revalidatePath("/admin/quick-review");
  revalidatePath("/ko");
  revalidatePath("/en");
}

export async function publishArticle(articleId: string) {
  const result = await publishArticleToLive(articleId);
  if (!result.ok) {
    if (result.step === "same_event_guard") {
      throw new Error(
        `유사한 공개 기사가 있습니다${
          result.sameEventMatch
            ? `: ${result.sameEventMatch.title.slice(0, 120)}`
            : ""
        }. 빠른 검토 화면에서 override 하거나 기존 기사를 확인하세요.`
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
      throw new Error(result.error);
    }
  }

  revalidatePublishPages();
}
