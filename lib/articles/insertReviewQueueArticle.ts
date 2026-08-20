import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeThumbnailUrl } from "@/lib/from-link/sanitizeThumbnail";
import {
  AI_THUMBNAIL_REVIEW_NOTE,
  ensureArticleThumbnail,
} from "@/lib/articles/thumbnail/ensureArticleThumbnail";
import {
  SOURCE_ADMIN_LINK_DRAFT,
  resolveSourceForStorage,
} from "@/lib/article/sourceResolution";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
  formatPostgrestError,
  formatSupabaseThrownError,
  type SupabaseOperationFailure,
} from "@/lib/supabase/serviceRole";

function makeSlug(value: string, fallback: string) {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return base || fallback;
}

export type InsertReviewQueueArticleInput = {
  source?: string;
  originalUrl: string;
  canonicalUrl?: string | null;
  titleOriginal: string;
  titleKo?: string | null;
  summaryOriginal?: string | null;
  summaryKo?: string | null;
  bodyOriginal?: string | null;
  bodyKo?: string | null;
  category?: string;
  thumbnailUrl?: string | null;
  customUniqueId?: string | null;
  topicKey?: string | null;
  topicLabel?: string | null;
  sourceSection?: string | null;
  sourceCountry?: string | null;
  languageOriginal?: string;
  languageTranslated?: string;
  /** Source article publish time (ISO), not site publish time. */
  publishedAt?: string | null;
  aiReviewNotes?: string | null;
  skipOriginalUrlDuplicateCheck?: boolean;
  /** When true (default) and no thumbnail URL, generate AI editorial illustration. */
  autoGenerateAiThumbnail?: boolean;
};

export type InsertReviewQueueArticleResult =
  | { ok: true; articleId: string }
  | {
      ok: false;
      error: string;
      step: string;
      code?: string;
      hint?: string;
      details?: string;
      duplicateArticleId?: string;
    };

function toInsertFailure(
  failure: SupabaseOperationFailure
): Extract<InsertReviewQueueArticleResult, { ok: false }> {
  const label = `[${failure.step}] ${failure.error}`;
  const extra = failure.details ? ` — ${failure.details}` : "";
  return {
    ok: false,
    error: `${label}${extra}`,
    step: failure.step,
    code: failure.code,
    hint: failure.hint,
    details: failure.details,
  };
}

async function safeCollectionLog(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
  envHost: string
) {
  try {
    const { error } = await supabase.from("collection_logs").insert(row);
    if (error) {
      console.error("[insertReviewQueueArticle] collection_logs (non-fatal)", {
        envHost,
        ...error,
      });
    }
  } catch (err) {
    console.error(
      "[insertReviewQueueArticle] collection_logs threw (non-fatal)",
      err
    );
  }
}

export async function insertReviewQueueArticle(
  input: InsertReviewQueueArticleInput
): Promise<InsertReviewQueueArticleResult> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    console.error("[insertReviewQueueArticle] env/dns check failed", envCheck);
    return {
      ok: false,
      error: envCheck.error,
      step: envCheck.step,
      hint: envCheck.hint,
      details:
        envCheck.missingVars.length > 0
          ? `missing: ${envCheck.missingVars.join(", ")}`
          : envCheck.hint,
    };
  }

  let supabase: SupabaseClient;
  try {
    supabase = createServiceRoleSupabaseClient().client;
  } catch (err) {
    const failure = formatSupabaseThrownError("client_create", err, envCheck.urlHost);
    return toInsertFailure(failure);
  }

  const originalUrl = input.originalUrl.trim();
  const source = resolveSourceForStorage(input.source, originalUrl).trim();
  const titleOriginal = input.titleOriginal.trim();

  if (!originalUrl || !titleOriginal) {
    return {
      ok: false,
      error: "originalUrl and titleOriginal are required",
      step: "input_validation",
    };
  }

  const customUniqueId =
    (input.customUniqueId || "").trim() || crypto.randomUUID();
  const sourceArticleId: string | null = null;

  let duplicateArticleId: string | null = null;

  try {
    const { data: byCustom, error: dupCustomErr } = await supabase
      .from("articles")
      .select("id")
      .eq("custom_unique_id", customUniqueId)
      .maybeSingle();

    if (dupCustomErr) {
      return toInsertFailure(
        formatPostgrestError("duplicate_check_custom_unique_id", dupCustomErr)
      );
    }

    const customRow = byCustom as { id: string } | null;
    if (customRow?.id) {
      duplicateArticleId = customRow.id;
    }

    if (!duplicateArticleId && sourceArticleId) {
      const { data, error: dupSourceErr } = await supabase
        .from("articles")
        .select("id")
        .eq("source", source)
        .eq("source_article_id", sourceArticleId)
        .maybeSingle();

      if (dupSourceErr) {
        return toInsertFailure(
          formatPostgrestError("duplicate_check_source_article_id", dupSourceErr)
        );
      }

      const row = data as { id: string } | null;
      if (row?.id) {
        duplicateArticleId = row.id;
      }
    }

    if (!duplicateArticleId && !input.skipOriginalUrlDuplicateCheck) {
      const { data, error: dupUrlErr } = await supabase
        .from("articles")
        .select("id")
        .eq("source", source)
        .eq("original_url", originalUrl)
        .maybeSingle();

      if (dupUrlErr) {
        return toInsertFailure(
          formatPostgrestError("duplicate_check_original_url", dupUrlErr)
        );
      }

      const row = data as { id: string } | null;
      if (row?.id) {
        duplicateArticleId = row.id;
      }
    }
  } catch (err) {
    return toInsertFailure(
      formatSupabaseThrownError("duplicate_check", err, envCheck.urlHost)
    );
  }

  if (duplicateArticleId) {
    return {
      ok: false,
      error: "duplicate article",
      step: "duplicate_check",
      duplicateArticleId,
    };
  }

  const now = Date.now();
  const languageOriginal = (input.languageOriginal || "ko").trim();

  const koTitle = (input.titleKo || "").trim();
  const koBody = (input.bodyKo || "").trim();
  const koSummary = (input.summaryKo || "").trim();

  /** English columns (title_original / body_original) — used for EN publish + localization. */
  const enTitle = (input.titleOriginal || "").trim();
  const enBody = (input.bodyOriginal || "").trim();
  const enSummary = (input.summaryOriginal || "").trim();

  const languageTranslated =
    (input.languageTranslated || "").trim() ||
    (languageOriginal === "en" ? "ko" : "en");

  const thumbnailUrlForInsert = sanitizeThumbnailUrl(input.thumbnailUrl);

  const articleInsert = {
    source,
    source_country: (input.sourceCountry || "KR").trim(),
    source_section: input.sourceSection || null,
    source_article_id: sourceArticleId,
    original_url: originalUrl,
    canonical_url: input.canonicalUrl ?? null,
    title_original: enTitle || titleOriginal,
    title_ko: koTitle || null,
    summary_ko: koSummary || null,
    body_original: enBody || null,
    summary_original: enSummary || null,
    language_original: languageOriginal,
    language_translated: languageTranslated,
    title_translated:
      languageOriginal === "en" ? koTitle || null : enTitle || koTitle || null,
    body_translated: koBody || null,
    summary_translated:
      languageOriginal === "en" ? koSummary || null : enSummary || koSummary || null,
    category: input.category || "other",
    topic_key: input.topicKey || null,
    topic_label: input.topicLabel || null,
    thumbnail_url: thumbnailUrlForInsert,
    custom_unique_id: customUniqueId,
    ai_review_status: "pending",
    ai_review_notes: null,
    review_status: "pending",
    revision_status: "none",
    status: "ready_for_human_review",
    is_published: false,
    published_at: input.publishedAt?.trim() || null,
    collected_at: new Date().toISOString(),
  };

  if (input.aiReviewNotes?.trim()) {
    (articleInsert as Record<string, unknown>).ai_review_notes =
      input.aiReviewNotes.trim();
  }

  let article: { id: string };

  try {
    const { data: insertedArticle, error: articleError } = await supabase
      .from("articles")
      .insert(articleInsert)
      .select("id")
      .single();

    if (articleError) {
      await safeCollectionLog(
        supabase,
        {
          source,
          checked_count: 1,
          saved_count: 0,
          duplicate_count: 0,
          failed_count: 1,
          status: "failed",
          note: articleError.message || "article insert failed",
        },
        envCheck.urlHost
      );
      return toInsertFailure(
        formatPostgrestError("insert_articles", articleError)
      );
    }

    const row = insertedArticle as { id: string } | null;
    if (!row?.id) {
      return {
        ok: false,
        error: "article insert returned no id",
        step: "insert_articles",
        hint: "insert 응답에 id가 없습니다.",
      };
    }
    article = row;
  } catch (err) {
    return toInsertFailure(
      formatSupabaseThrownError("insert_articles", err, envCheck.urlHost)
    );
  }

  if (
    !thumbnailUrlForInsert &&
    input.autoGenerateAiThumbnail !== false &&
    koTitle
  ) {
    const thumb = await ensureArticleThumbnail(supabase, {
      articleId: article.id,
      existingThumbnailUrl: null,
      category: input.category || "other",
      titleKo: koTitle,
      summaryKo: koSummary || null,
      supabaseProjectUrl: envCheck.url,
    });

    if (thumb.ok && thumb.source === "ai_generated" && thumb.thumbnailUrl) {
      const mergedNotes = [input.aiReviewNotes?.trim(), AI_THUMBNAIL_REVIEW_NOTE]
        .filter(Boolean)
        .join("\n\n");

      const { error: thumbUpdateErr } = await supabase
        .from("articles")
        .update({
          thumbnail_url: thumb.thumbnailUrl,
          ai_review_notes: mergedNotes || null,
        })
        .eq("id", article.id);

      if (thumbUpdateErr) {
        console.warn(
          "[insertReviewQueueArticle] ai thumbnail url update failed",
          thumbUpdateErr
        );
      }
    }
  }

  const localizations: Array<Record<string, unknown>> = [];

  if (koTitle) {
    localizations.push({
      article_id: article.id,
      locale: "ko",
      title: koTitle,
      body: koBody || null,
      summary: koSummary || null,
      slug: makeSlug(koTitle, `ko-${now}`),
      meta_description: koSummary || null,
      is_primary_locale: true,
    });
  }

  if (enTitle) {
    localizations.push({
      article_id: article.id,
      locale: "en",
      title: enTitle,
      body: enBody || null,
      summary: enSummary || null,
      slug: makeSlug(enTitle, `en-${now}`),
      meta_description: enSummary || null,
      is_primary_locale: languageOriginal === "en",
    });
  }

  if (localizations.length > 0) {
    try {
      const { error: localizationError } = await supabase
        .from("article_localizations")
        .insert(localizations);

      if (localizationError) {
        await supabase.from("article_localizations").delete().eq("article_id", article.id);
        await supabase.from("articles").delete().eq("id", article.id);
        await safeCollectionLog(
          supabase,
          {
            source,
            checked_count: 1,
            saved_count: 0,
            duplicate_count: 0,
            failed_count: 1,
            status: "failed",
            note: localizationError.message,
          },
          envCheck.urlHost
        );
        return toInsertFailure(
          formatPostgrestError("insert_article_localizations", localizationError)
        );
      }
    } catch (err) {
      await supabase.from("article_localizations").delete().eq("article_id", article.id);
      await supabase.from("articles").delete().eq("id", article.id);
      return toInsertFailure(
        formatSupabaseThrownError(
          "insert_article_localizations",
          err,
          envCheck.urlHost
        )
      );
    }
  }

  await safeCollectionLog(
    supabase,
    {
      source,
      checked_count: 1,
      saved_count: 1,
      duplicate_count: 0,
      failed_count: 0,
      status: "success",
      note: "review queue article inserted",
    },
    envCheck.urlHost
  );

  console.info("[insertReviewQueueArticle] success", {
    articleId: article.id,
    host: envCheck.urlHost,
    source,
  });

  return { ok: true, articleId: article.id };
}
