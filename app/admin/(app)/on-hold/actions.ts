"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../../../../lib/supabase";

function getArticleIdsFromFormData(formData: FormData) {
  return formData
    .getAll("articleIds")
    .map((value) => String(value))
    .filter(Boolean);
}

function revalidateOnHoldPages(articleId?: string) {
  revalidatePath("/admin/on-hold");
  revalidatePath("/admin/review");
  revalidatePath("/admin");

  if (articleId) {
    revalidatePath(`/admin/review/${articleId}`);
  }
}

/** 보류 기사를 다시 검토 대기(pending)로 되돌립니다. */
export async function resumeToReview(articleId: string) {
  const { error } = await supabase
    .from("articles")
    .update({
      status: "ready_for_human_review",
      review_status: "pending",
      is_published: false,
    })
    .eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateOnHoldPages(articleId);
}

export async function bulkResumeToReview(formData: FormData) {
  const articleIds = getArticleIdsFromFormData(formData);
  if (articleIds.length === 0) return;

  const { error } = await supabase
    .from("articles")
    .update({
      status: "ready_for_human_review",
      review_status: "pending",
      is_published: false,
    })
    .in("id", articleIds);

  if (error) {
    throw new Error(error.message);
  }

  revalidateOnHoldPages();
}
