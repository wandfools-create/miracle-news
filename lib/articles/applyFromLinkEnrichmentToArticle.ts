import "server-only";

import type { FromLinkCommitFields } from "@/lib/from-link/prepareFromLinkCommitFields";
import {
  AI_THUMBNAIL_REVIEW_NOTE,
  ensureArticleThumbnail,
} from "@/lib/articles/thumbnail/ensureArticleThumbnail";
import { sanitizeThumbnailUrl } from "@/lib/from-link/sanitizeThumbnail";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
  formatPostgrestError,
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

export type ApplyFromLinkEnrichmentResult =
  | { ok: true; articleId: string; thumbnailSource: "extracted" | "ai_generated" | "none" }
  | { ok: false; error: string; step: string };

export async function applyFromLinkEnrichmentToArticle(input: {
  articleId: string;
  fields: FromLinkCommitFields;
  /** When true, generate AI thumbnail if extracted image is missing. */
  autoGenerateAiThumbnail?: boolean;
}): Promise<ApplyFromLinkEnrichmentResult> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error, step: envCheck.step };
  }

  const { client } = createServiceRoleSupabaseClient();
  const articleId = input.articleId;
  const f = input.fields;
  const now = Date.now();

  let thumbnailUrl = sanitizeThumbnailUrl(f.thumbnailUrl);
  let thumbnailSource: "extracted" | "ai_generated" | "none" = thumbnailUrl
    ? "extracted"
    : "none";

  const updatePayload: Record<string, unknown> = {
    source: f.source,
    source_country: f.sourceCountry,
    source_section: f.sourceSection,
    original_url: f.originalUrl,
    title_original: f.titleOriginal,
    title_ko: f.titleKo,
    summary_ko: f.summaryKo,
    summary_original: f.summaryOriginal,
    body_original: f.bodyOriginal,
    body_translated: f.bodyKo,
    title_translated: f.languageOriginal === "en" ? f.titleKo : f.titleOriginal,
    summary_translated:
      f.languageOriginal === "en" ? f.summaryKo : f.summaryOriginal,
    language_original: f.languageOriginal,
    language_translated: f.languageTranslated,
    category: f.category,
    thumbnail_url: thumbnailUrl,
    published_at: f.publishedAt,
    ai_review_status: "pending",
    ai_review_notes: f.aiReviewNotes,
    review_status: "pending",
    revision_status: "none",
    status: "ready_for_human_review",
    is_published: false,
  };

  const { error: updateError } = await client
    .from("articles")
    .update(updatePayload)
    .eq("id", articleId);

  if (updateError) {
    const formatted = formatPostgrestError("update_articles", updateError);
    return { ok: false, error: formatted.error, step: formatted.step };
  }

  const upsertLocalization = async (
    locale: "ko" | "en",
    payload: {
      title: string;
      summary: string | null;
      body: string | null;
      isPrimary: boolean;
    }
  ) => {
    const { data: existing } = await client
      .from("article_localizations")
      .select("id")
      .eq("article_id", articleId)
      .eq("locale", locale)
      .maybeSingle();

    const row = {
      title: payload.title,
      summary: payload.summary,
      body: payload.body,
      meta_description: payload.summary,
      slug: makeSlug(payload.title, `${locale}-${now}`),
      is_primary_locale: payload.isPrimary,
    };

    if (existing?.id) {
      await client.from("article_localizations").update(row).eq("id", existing.id);
    } else {
      await client.from("article_localizations").insert({
        article_id: articleId,
        locale,
        ...row,
      });
    }
  };

  await upsertLocalization("ko", {
    title: f.titleKo,
    summary: f.summaryKo,
    body: f.bodyKo,
    isPrimary: f.languageOriginal === "ko",
  });

  await upsertLocalization("en", {
    title: f.titleOriginal,
    summary: f.summaryOriginal,
    body: f.bodyOriginal,
    isPrimary: f.languageOriginal === "en",
  });

  if (
    !thumbnailUrl &&
    input.autoGenerateAiThumbnail !== false &&
    f.titleKo.trim()
  ) {
    const thumb = await ensureArticleThumbnail(client, {
      articleId,
      existingThumbnailUrl: null,
      category: f.category,
      titleKo: f.titleKo,
      summaryKo: f.summaryKo,
      supabaseProjectUrl: envCheck.url,
    });

    if (thumb.ok && thumb.source === "ai_generated" && thumb.thumbnailUrl) {
      thumbnailUrl = thumb.thumbnailUrl;
      thumbnailSource = "ai_generated";
      await client
        .from("articles")
        .update({
          thumbnail_url: thumbnailUrl,
          ai_review_notes: [f.aiReviewNotes, AI_THUMBNAIL_REVIEW_NOTE]
            .filter(Boolean)
            .join("\n\n"),
        })
        .eq("id", articleId);
    }
  }

  return { ok: true, articleId, thumbnailSource };
}
