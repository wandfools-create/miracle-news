"use server";

import { revalidatePath } from "next/cache";
import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";
import { supabase } from "../../../../lib/supabase";

function getArticleIdsFromFormData(formData: FormData) {
  return formData
    .getAll("articleIds")
    .map((value) => String(value))
    .filter(Boolean);
}

function revalidatePublishedPages() {
  revalidatePath("/");
  revalidatePath("/ko");
  revalidatePath("/en");
  revalidatePath("/admin/published");
  revalidatePath("/admin/approved");
  revalidatePath("/admin/revision");
  revalidatePath("/admin/review");
}

async function unpublishArticleById(articleId: string) {
  const { error } = await supabase
    .from("articles")
    .update({
      status: ARTICLE_WORKFLOW.approved.status,
      review_status: ARTICLE_WORKFLOW.approved.review_status,
      revision_status: ARTICLE_WORKFLOW.approved.revision_status,
      is_published: ARTICLE_WORKFLOW.approved.is_published,
      published_at: null,
    })
    .eq("id", articleId);

  if (error) throw new Error(error.message);
}

async function sendArticleToRevisionById(articleId: string) {
  const { error } = await supabase
    .from("articles")
    .update({
      status: ARTICLE_WORKFLOW.revision.status,
      review_status: ARTICLE_WORKFLOW.revision.review_status,
      revision_status: ARTICLE_WORKFLOW.revision.revision_status,
      is_published: false,
    })
    .eq("id", articleId);

  if (error) throw new Error(error.message);
}

async function setMainNewsById(articleId: string) {
  const { data: topStories, error: fetchError } = await supabase
    .from("articles")
    .select("top_story_order")
    .eq("is_top_story", true);
  if (fetchError) throw new Error(fetchError.message);

  const maxOrder =
    (topStories ?? []).reduce((max, row) => {
      const value =
        typeof row.top_story_order === "number" && row.top_story_order > 0
          ? row.top_story_order
          : 0;
      return Math.max(max, value);
    }, 0) || 0;

  const nextOrder = maxOrder > 0 ? maxOrder + 1 : 1;

  const { error } = await supabase
    .from("articles")
    .update({
      is_top_story: true,
      top_story_order: nextOrder,
    })
    .eq("id", articleId);

  if (error) throw new Error(error.message);
}

async function clearMainNewsById(articleId: string) {
  const { error } = await supabase
    .from("articles")
    .update({
      is_top_story: false,
      top_story_order: 0,
    })
    .eq("id", articleId);

  if (error) throw new Error(error.message);
}

export async function unpublishArticle(formData: FormData) {
  const articleId = String(formData.get("articleId") || "");
  if (!articleId) return;
  await unpublishArticleById(articleId);
  revalidatePublishedPages();
}

export async function sendToRevisionFromPublished(formData: FormData) {
  const articleId = String(formData.get("articleId") || "");
  if (!articleId) return;
  await sendArticleToRevisionById(articleId);
  revalidatePublishedPages();
}

export async function setMainNewsFromPublished(formData: FormData) {
  const articleId = String(formData.get("articleId") || "");
  if (!articleId) return;
  await setMainNewsById(articleId);
  revalidatePublishedPages();
}

export async function clearMainNewsFromPublished(formData: FormData) {
  const articleId = String(formData.get("articleId") || "");
  if (!articleId) return;
  await clearMainNewsById(articleId);
  revalidatePublishedPages();
}

export async function bulkUnpublishArticles(formData: FormData) {
  const articleIds = getArticleIdsFromFormData(formData);
  if (articleIds.length === 0) return;

  for (const id of articleIds) {
    await unpublishArticleById(id);
  }

  revalidatePublishedPages();
}

export async function bulkSendToRevisionFromPublished(formData: FormData) {
  const articleIds = getArticleIdsFromFormData(formData);
  if (articleIds.length === 0) return;

  for (const id of articleIds) {
    await sendArticleToRevisionById(id);
  }

  revalidatePublishedPages();
}
