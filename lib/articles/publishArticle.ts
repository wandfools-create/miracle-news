import "server-only";

import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";
import {
  isQuickReviewArticle,
  resolvePublishCopy,
  validateQuickPublishContent,
  type PublishArticleFields,
} from "@/lib/articles/quickPublishGuards";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

export type { PublishArticleFields };
export {
  isQuickReviewArticle,
  resolvePublishCopy,
  validateQuickPublishContent,
} from "@/lib/articles/quickPublishGuards";

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

const PUBLISH_SELECT = `
  id,
  published_at,
  title_original,
  body_original,
  summary_original,
  title_translated,
  body_translated,
  summary_translated,
  title_ko,
  summary_ko,
  review_status,
  status,
  is_published,
  ai_review_status,
  ai_review_notes
`;

async function upsertLocalizations(
  client: ReturnType<typeof createServiceRoleSupabaseClient>["client"],
  articleId: string,
  copy: ReturnType<typeof resolvePublishCopy>
): Promise<void> {
  const koSlug = `${slugify(copy.koTitle || "article", "article")}-${articleId.slice(0, 8)}`;
  const enSlug = `${slugify(copy.enTitle || "article", "article")}-${articleId.slice(0, 8)}`;

  const { data: existingLocalizations, error: localizationFetchError } =
    await client
      .from("article_localizations")
      .select("id, locale")
      .eq("article_id", articleId);

  if (localizationFetchError) {
    throw new Error(localizationFetchError.message);
  }

  const existingKo = existingLocalizations?.find((row) => row.locale === "ko");
  const existingEn = existingLocalizations?.find((row) => row.locale === "en");

  if (existingKo) {
    const { error } = await client
      .from("article_localizations")
      .update({
        title: copy.koTitle || "기사",
        summary: copy.koSummary || null,
        body: copy.koBody || null,
        slug: koSlug,
        meta_description: copy.koSummary || null,
      })
      .eq("id", existingKo.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await client.from("article_localizations").insert({
      article_id: articleId,
      locale: "ko",
      title: copy.koTitle || "기사",
      summary: copy.koSummary || null,
      body: copy.koBody || null,
      slug: koSlug,
      meta_description: copy.koSummary || null,
    });
    if (error) throw new Error(error.message);
  }

  if (existingEn) {
    const { error } = await client
      .from("article_localizations")
      .update({
        title: copy.enTitle || "article",
        summary: copy.enSummary || null,
        body: copy.enBody || null,
        slug: enSlug,
        meta_description: copy.enSummary || null,
      })
      .eq("id", existingEn.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await client.from("article_localizations").insert({
      article_id: articleId,
      locale: "en",
      title: copy.enTitle || "article",
      summary: copy.enSummary || null,
      body: copy.enBody || null,
      slug: enSlug,
      meta_description: copy.enSummary || null,
    });
    if (error) throw new Error(error.message);
  }
}

export type PublishArticleToLiveResult =
  | { ok: true; publishedAt: string; firstPublish: boolean }
  | { ok: false; error: string; step: string };

/**
 * Shared publish core (approved queue + quick review).
 * Order: localizations first → then published flags (avoids partial live state).
 * Never calls OpenAI.
 */
export async function publishArticleToLive(
  articleId: string,
  options?: {
    /** When set, only transition from this review_status (race-safe). */
    requireReviewStatus?: string;
  }
): Promise<PublishArticleToLiveResult> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error, step: envCheck.step };
  }

  const { client } = createServiceRoleSupabaseClient();

  const { data, error: fetchError } = await client
    .from("articles")
    .select(PUBLISH_SELECT)
    .eq("id", articleId)
    .maybeSingle();

  if (fetchError || !data) {
    return {
      ok: false,
      error: fetchError?.message || "기사를 찾을 수 없습니다.",
      step: "fetch",
    };
  }

  const article = data as PublishArticleFields;

  if (article.is_published === true && article.status === "published") {
    return {
      ok: true,
      publishedAt: article.published_at?.trim() || new Date().toISOString(),
      firstPublish: false,
    };
  }

  if (
    options?.requireReviewStatus &&
    article.review_status !== options.requireReviewStatus
  ) {
    return {
      ok: false,
      error: `이 기사는 빠른 공개 대상이 아닙니다 (현재: ${article.review_status}).`,
      step: "status_guard",
    };
  }

  const copy = resolvePublishCopy(article);

  try {
    await upsertLocalizations(client, articleId, copy);
  } catch (err) {
    return {
      ok: false,
      error: String(err),
      step: "localizations",
    };
  }

  const existingPublishedAt = article.published_at?.trim() || null;
  const sitePublishedAt = existingPublishedAt ?? new Date().toISOString();
  const firstPublish = !existingPublishedAt;

  let updateQuery = client
    .from("articles")
    .update({
      ...ARTICLE_WORKFLOW.published,
      ...(firstPublish ? { published_at: sitePublishedAt } : {}),
      approved_at: new Date().toISOString(),
    })
    .eq("id", articleId)
    .eq("is_published", false);

  if (options?.requireReviewStatus) {
    updateQuery = updateQuery.eq("review_status", options.requireReviewStatus);
  }

  const { data: updated, error: updateError } = await updateQuery
    .select("id")
    .maybeSingle();

  if (updateError) {
    return { ok: false, error: updateError.message, step: "publish_update" };
  }
  if (!updated) {
    return {
      ok: false,
      error: "공개 상태 갱신에 실패했습니다 (이미 처리됐을 수 있음).",
      step: "publish_update",
    };
  }

  return { ok: true, publishedAt: sitePublishedAt, firstPublish };
}

/**
 * One-click quick publish: content guard + publishArticleToLive.
 * Combines former approve → approved → publish into one transition.
 * No OpenAI.
 */
export async function quickPublishArticle(
  articleId: string
): Promise<
  | PublishArticleToLiveResult
  | {
      ok: false;
      error: string;
      step: string;
      errors?: string[];
      warnings?: string[];
    }
> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error, step: envCheck.step };
  }

  const { client } = createServiceRoleSupabaseClient();
  const { data, error } = await client
    .from("articles")
    .select(PUBLISH_SELECT)
    .eq("id", articleId)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message || "기사를 찾을 수 없습니다.",
      step: "fetch",
    };
  }

  const article = data as PublishArticleFields;
  if (!isQuickReviewArticle(article)) {
    return {
      ok: false,
      error: "빠른 검토 상태의 기사만 바로 공개할 수 있습니다.",
      step: "status_guard",
    };
  }

  const content = validateQuickPublishContent(article);
  if (!content.ok) {
    return {
      ok: false,
      error: content.errors.join(" "),
      step: "content_guard",
      errors: content.errors,
      warnings: content.warnings,
    };
  }

  return publishArticleToLive(articleId, {
    requireReviewStatus: ARTICLE_WORKFLOW.quickReview.review_status,
  });
}

/** Move quick_review → normal review queue (수정 필요). No OpenAI. */
export async function sendQuickReviewToReviewQueue(
  articleId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return { ok: false, error: envCheck.error };

  const { client } = createServiceRoleSupabaseClient();
  const { data, error } = await client
    .from("articles")
    .update({
      ...ARTICLE_WORKFLOW.review,
      revision_status: "none",
      is_published: false,
    })
    .eq("id", articleId)
    .eq("review_status", ARTICLE_WORKFLOW.quickReview.review_status)
    .eq("is_published", false)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "빠른 검토 기사를 찾을 수 없습니다." };
  return { ok: true };
}

/** Move quick_review → on_hold. No OpenAI. */
export async function holdQuickReviewArticle(
  articleId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return { ok: false, error: envCheck.error };

  const { client } = createServiceRoleSupabaseClient();
  const { data, error } = await client
    .from("articles")
    .update({
      status: "ready_for_human_review",
      review_status: "on_hold",
      is_published: false,
    })
    .eq("id", articleId)
    .eq("review_status", ARTICLE_WORKFLOW.quickReview.review_status)
    .eq("is_published", false)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "빠른 검토 기사를 찾을 수 없습니다." };
  return { ok: true };
}

/** Ensure an article sits in quick_review (e.g. already-enriched Discord retry). */
export async function moveArticleToQuickReview(
  articleId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return { ok: false, error: envCheck.error };

  const { client } = createServiceRoleSupabaseClient();
  const { data: existing, error: fetchError } = await client
    .from("articles")
    .select("id, review_status, status, is_published")
    .eq("id", articleId)
    .maybeSingle();

  if (fetchError || !existing) {
    return { ok: false, error: fetchError?.message || "기사를 찾을 수 없습니다." };
  }

  if ((existing as { is_published?: boolean }).is_published) {
    return { ok: false, error: "이미 공개된 기사입니다." };
  }

  if (
    (existing as { review_status?: string }).review_status ===
    ARTICLE_WORKFLOW.quickReview.review_status
  ) {
    return { ok: true };
  }

  const { error } = await client
    .from("articles")
    .update({ ...ARTICLE_WORKFLOW.quickReview })
    .eq("id", articleId)
    .eq("is_published", false);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
