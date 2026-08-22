"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../../../../lib/supabase";

function slugify(value: string, fallback: string) {
  const base = (value || fallback || "article")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return base || fallback;
}

function getArticleIdsFromFormData(formData: FormData) {
  return formData
    .getAll("articleIds")
    .map((value) => String(value))
    .filter(Boolean);
}

async function publishSingleArticle(articleId: string) {
  const { data: article, error: fetchError } = await supabase
    .from("articles")
    .select(`
      id,
      source,
      category,
      published_at,
      thumbnail_url,
      original_url,
      title_original,
      body_original,
      summary_original,
      title_translated,
      body_translated,
      summary_translated,
      title_ko,
      summary_ko
    `)
    .eq("id", articleId)
    .single();

  if (fetchError || !article) {
    throw new Error(fetchError?.message || "기사를 찾을 수 없습니다.");
  }

  const existingPublishedAt = article.published_at?.trim() || null;
  const publishedAt = existingPublishedAt ?? new Date().toISOString();

  const { error: updateError } = await supabase
    .from("articles")
    .update({
      status: "published",
      review_status: "approved",
      is_published: true,
      ...(existingPublishedAt ? {} : { published_at: publishedAt }),
    })
    .eq("id", articleId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const koTitle =
    article.title_ko ||
    article.title_translated ||
    article.title_original ||
    "기사";

  const koSummary =
    article.summary_ko ||
    article.summary_translated ||
    article.summary_original ||
    null;

  const koBody =
    article.body_translated ||
    article.body_original ||
    null;

  const enTitle = article.title_original || "article";
  const enSummary = article.summary_original || null;
  const enBody = article.body_original || null;

  const koSlug = `${slugify(koTitle, "article")}-${articleId.slice(0, 8)}`;
  const enSlug = `${slugify(enTitle, "article")}-${articleId.slice(0, 8)}`;

  const { data: existingLocalizations, error: localizationFetchError } =
    await supabase
      .from("article_localizations")
      .select("id, locale")
      .eq("article_id", articleId);

  if (localizationFetchError) {
    throw new Error(localizationFetchError.message);
  }

  const existingKo = existingLocalizations?.find((row) => row.locale === "ko");
  const existingEn = existingLocalizations?.find((row) => row.locale === "en");

  if (existingKo) {
    const { error: koUpdateError } = await supabase
      .from("article_localizations")
      .update({
        title: koTitle,
        summary: koSummary,
        body: koBody,
        slug: koSlug,
        meta_description: koSummary,
      })
      .eq("id", existingKo.id);

    if (koUpdateError) {
      throw new Error(koUpdateError.message);
    }
  } else {
    const { error: koInsertError } = await supabase
      .from("article_localizations")
      .insert({
        article_id: articleId,
        locale: "ko",
        title: koTitle,
        summary: koSummary,
        body: koBody,
        slug: koSlug,
        meta_description: koSummary,
      });

    if (koInsertError) {
      throw new Error(koInsertError.message);
    }
  }

  if (existingEn) {
    const { error: enUpdateError } = await supabase
      .from("article_localizations")
      .update({
        title: enTitle,
        summary: enSummary,
        body: enBody,
        slug: enSlug,
        meta_description: enSummary,
      })
      .eq("id", existingEn.id);

    if (enUpdateError) {
      throw new Error(enUpdateError.message);
    }
  } else {
    const { error: enInsertError } = await supabase
      .from("article_localizations")
      .insert({
        article_id: articleId,
        locale: "en",
        title: enTitle,
        summary: enSummary,
        body: enBody,
        slug: enSlug,
        meta_description: enSummary,
      });

    if (enInsertError) {
      throw new Error(enInsertError.message);
    }
  }
}

function revalidatePublishPages() {
  revalidatePath("/admin/approved");
  revalidatePath("/admin/published");
  revalidatePath("/admin/review");
  revalidatePath("/ko");
  revalidatePath("/en");
}

export async function publishArticle(articleId: string) {
  await publishSingleArticle(articleId);
  revalidatePublishPages();
}

export async function bulkPublishArticles(formData: FormData) {
  const articleIds = getArticleIdsFromFormData(formData);

  if (articleIds.length === 0) return;

  for (const articleId of articleIds) {
    await publishSingleArticle(articleId);
  }

  revalidatePublishPages();
}
