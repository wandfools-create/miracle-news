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
