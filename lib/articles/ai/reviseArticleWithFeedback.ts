import "server-only";

import { fetchPagePlainText } from "@/lib/from-link/fetchPlainText";
import {
  countSubstantiveParagraphs,
  stripUrlsFromArticleText,
} from "@/lib/from-link/sanitizeArticleText";
import {
  INSUFFICIENT_MATERIAL_MESSAGE,
  validateFromLinkDraftQuality,
} from "@/lib/from-link/validateArticleQuality";
import { detectContentLanguage } from "@/lib/from-link/detectContentLanguage";
import type { ContentLanguage } from "@/lib/from-link/types";
import {
  KOREAN_EDITOR_JSON_SYSTEM_PROMPT,
  REVISION_EDITOR_EXTRA_PROMPT,
} from "@/lib/articles/ai/editorPrompt";
import {
  AI_THUMBNAIL_REVIEW_NOTE,
  ensureArticleThumbnail,
} from "@/lib/articles/thumbnail/ensureArticleThumbnail";
import { chatCompletionJson, formatOpenAiFailureForUi } from "@/lib/openai/chatCompletionJson";
import { checkOpenAiEnv } from "@/lib/openai/env";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

const FEEDBACK_TYPE_LABELS: Record<string, string> = {
  title_mismatch: "제목 불일치",
  image_mismatch: "이미지 불일치",
  content_mismatch: "내용 불일치",
  bad_translation: "번역 이상",
  wrong_link: "링크 문제",
  wrong_category: "카테고리 오류",
  low_quality_article: "기사 품질 낮음",
  duplicate_issue: "중복 이슈",
  other: "기타",
};

export type ReviseArticleWithFeedbackInput = {
  articleId: string;
  feedbackType: string;
  feedbackNote: string;
  revisionLogId?: string | null;
};

export type ReviseArticleWithFeedbackResult =
  | {
      ok: true;
      articleId: string;
      revisionNotesKo: string | null;
      thumbnailRegenerated: boolean;
    }
  | {
      ok: false;
      step: string;
      error: string;
      hint?: string;
      uiMessage: string;
    };

function joinMaterial(parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
}

function parseEditorJson(data: Record<string, unknown>) {
  const o = data;
  const usable = o.usable === true;
  const reason_ko =
    typeof o.reason_ko === "string" && o.reason_ko.trim()
      ? o.reason_ko.trim()
      : null;

  const article_body_ko = stripUrlsFromArticleText(
    typeof o.article_body_ko === "string"
      ? o.article_body_ko
      : typeof o.article_summary_ko === "string"
        ? o.article_summary_ko
        : ""
  );
  const summary_ko = stripUrlsFromArticleText(
    typeof o.summary_ko === "string" ? o.summary_ko : ""
  );
  const title_ko =
    typeof o.title_ko === "string" ? stripUrlsFromArticleText(o.title_ko) : "";
  const article_body_original = stripUrlsFromArticleText(
    typeof o.article_body_original === "string"
      ? o.article_body_original
      : typeof o.article_summary_original === "string"
        ? o.article_summary_original
        : ""
  );
  const revision_notes_ko =
    typeof o.revision_notes_ko === "string" && o.revision_notes_ko.trim()
      ? o.revision_notes_ko.trim()
      : null;

  const langRaw = String(o.source_language || "").toLowerCase();
  const contentLanguage: ContentLanguage =
    langRaw === "en" || langRaw === "ko"
      ? langRaw
      : detectContentLanguage(article_body_ko || summary_ko);

  return {
    usable,
    reason_ko,
    title_ko,
    summary_ko,
    article_body_ko,
    article_body_original,
    revision_notes_ko,
    contentLanguage,
  };
}

export async function reviseArticleWithFeedback(
  input: ReviseArticleWithFeedbackInput
): Promise<ReviseArticleWithFeedbackResult> {
  const openAiEnv = checkOpenAiEnv();
  if (!openAiEnv.ok) {
    const uiMessage = `[openai_env_check] ${openAiEnv.error}\n${openAiEnv.hint}`;
    console.error("[reviseArticleWithFeedback]", uiMessage);
    return {
      ok: false,
      step: "openai_env_check",
      error: openAiEnv.error,
      hint: openAiEnv.hint,
      uiMessage,
    };
  }

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    const uiMessage = `[${envCheck.step}] ${envCheck.error}`;
    console.error("[reviseArticleWithFeedback] supabase env", envCheck);
    return {
      ok: false,
      step: envCheck.step,
      error: envCheck.error,
      hint: envCheck.hint,
      uiMessage,
    };
  }

  let supabase;
  let supabaseUrl: string;
  try {
    const created = createServiceRoleSupabaseClient();
    supabase = created.client;
    supabaseUrl = created.env.url;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      step: "supabase_client",
      error: message,
      uiMessage: `[supabase_client] ${message}`,
    };
  }

  const { data: article, error: loadError } = await supabase
    .from("articles")
    .select(
      `
      id,
      original_url,
      title_original,
      body_original,
      summary_original,
      title_ko,
      summary_ko,
      title_translated,
      body_translated,
      summary_translated,
      category,
      thumbnail_url
    `
    )
    .eq("id", input.articleId)
    .single();

  if (loadError || !article) {
    const msg = loadError?.message || "기사를 찾을 수 없습니다.";
    return {
      ok: false,
      step: "load_article",
      error: msg,
      uiMessage: `[load_article] ${msg}`,
    };
  }

  const originalUrl = (article.original_url || "").trim();
  let material = joinMaterial([
    originalUrl ? `SOURCE_URL: ${originalUrl}` : null,
    article.title_original ? `원문 제목: ${article.title_original}` : null,
    article.summary_original ? `원문 요약: ${article.summary_original}` : null,
    article.body_original ? `원문 본문:\n${article.body_original}` : null,
    article.title_ko || article.title_translated
      ? `현재 한글 제목: ${article.title_ko || article.title_translated}`
      : null,
    article.summary_ko || article.summary_translated
      ? `현재 한글 요약: ${article.summary_ko || article.summary_translated}`
      : null,
    article.body_translated
      ? `현재 한글 본문:\n${article.body_translated}`
      : null,
  ]);

  if (originalUrl && material.length < 900) {
    try {
      const fetched = await fetchPagePlainText(originalUrl, 22_000);
      if (fetched && fetched.length > material.length) {
        material = joinMaterial([
          `SOURCE_URL: ${originalUrl}`,
          `[페이지에서 추가 추출]`,
          fetched,
          article.body_translated
            ? `[기존 한글 초안]\n${article.body_translated}`
            : null,
        ]);
      }
    } catch (err) {
      console.warn("[reviseArticleWithFeedback] fetchPagePlainText failed", err);
    }
  }

  if (material.length < 120) {
    const uiMessage = INSUFFICIENT_MATERIAL_MESSAGE;
    return {
      ok: false,
      step: "insufficient_material",
      error: uiMessage,
      uiMessage: `[insufficient_material] ${uiMessage}`,
    };
  }

  const feedbackLabel =
    FEEDBACK_TYPE_LABELS[input.feedbackType] ?? input.feedbackType;

  console.info("[reviseArticleWithFeedback] OpenAI start", {
    articleId: input.articleId,
    feedbackType: input.feedbackType,
    model: openAiEnv.model,
    keyPrefix: openAiEnv.keyPrefix,
    materialChars: material.length,
  });

  const ai = await chatCompletionJson<Record<string, unknown>>({
    step: "revise_article_chat",
    system: KOREAN_EDITOR_JSON_SYSTEM_PROMPT + REVISION_EDITOR_EXTRA_PROMPT,
    user: JSON.stringify({
      task: "revision",
      feedback_type: input.feedbackType,
      feedback_type_label: feedbackLabel,
      feedback_note: input.feedbackNote.trim(),
      material: material.slice(0, 28_000),
    }),
  });

  if (!ai.ok) {
    const uiMessage = formatOpenAiFailureForUi(ai);
    console.error("[reviseArticleWithFeedback] OpenAI failed", ai);
    return {
      ok: false,
      step: ai.step,
      error: ai.error,
      hint: ai.hint,
      uiMessage,
    };
  }

  const parsed = parseEditorJson(ai.data);

  if (!parsed.usable) {
    const reason =
      parsed.reason_ko ||
      "수정 요청을 반영한 기사를 사실에 기반해 작성할 수 없습니다.";
    return {
      ok: false,
      step: "openai_usable_false",
      error: reason,
      uiMessage: `[openai_usable_false] ${reason}`,
    };
  }

  if (!parsed.title_ko || !parsed.summary_ko || !parsed.article_body_ko) {
    const reason = parsed.reason_ko || INSUFFICIENT_MATERIAL_MESSAGE;
    return {
      ok: false,
      step: "openai_incomplete_fields",
      error: reason,
      uiMessage: `[openai_incomplete_fields] ${reason}`,
    };
  }

  const qualityUrl =
    originalUrl && originalUrl.startsWith("http")
      ? originalUrl
      : `https://revision.local/articles/${input.articleId}`;

  const quality = validateFromLinkDraftQuality({
    submittedOriginalUrl: qualityUrl,
    titleKo: parsed.title_ko,
    summaryKo: parsed.summary_ko,
    bodyKo: parsed.article_body_ko,
  });

  if (!quality.ok) {
    return {
      ok: false,
      step: "quality_check",
      error: quality.reason,
      uiMessage: `[quality_check] ${quality.reason}`,
    };
  }

  if (countSubstantiveParagraphs(parsed.article_body_ko) < 5) {
    return {
      ok: false,
      step: "quality_paragraphs",
      error: INSUFFICIENT_MATERIAL_MESSAGE,
      uiMessage: `[quality_paragraphs] ${INSUFFICIENT_MATERIAL_MESSAGE}`,
    };
  }

  const nowNote = [
    `AI 수정 (${new Date().toISOString()})`,
    `유형: ${feedbackLabel}`,
    parsed.revision_notes_ko,
  ]
    .filter(Boolean)
    .join("\n");

  const { error: updateError } = await supabase
    .from("articles")
    .update({
      title_ko: parsed.title_ko,
      summary_ko: parsed.summary_ko,
      title_translated: parsed.title_ko,
      summary_translated: parsed.summary_ko,
      body_translated: parsed.article_body_ko,
      body_original:
        parsed.contentLanguage === "en" && parsed.article_body_original
          ? parsed.article_body_original
          : article.body_original,
      ai_review_status: "pending",
      ai_review_notes: nowNote,
      revision_status: "requested",
    })
    .eq("id", input.articleId);

  if (updateError) {
    const msg = updateError.message;
    return {
      ok: false,
      step: "update_article",
      error: msg,
      uiMessage: `[update_article] ${msg}`,
    };
  }

  const { data: koLoc } = await supabase
    .from("article_localizations")
    .select("id")
    .eq("article_id", input.articleId)
    .eq("locale", "ko")
    .maybeSingle();

  const koPayload = {
    title: parsed.title_ko,
    summary: parsed.summary_ko,
    body: parsed.article_body_ko,
    meta_description: parsed.summary_ko,
  };

  if (koLoc?.id) {
    await supabase
      .from("article_localizations")
      .update(koPayload)
      .eq("id", koLoc.id);
  }

  let thumbnailRegenerated = false;
  const wantsNewThumb =
    input.feedbackType === "image_mismatch" ||
    input.feedbackType === "low_quality_article";

  if (wantsNewThumb && parsed.title_ko) {
    const thumb = await ensureArticleThumbnail(supabase, {
      articleId: input.articleId,
      existingThumbnailUrl: null,
      category: article.category || "other",
      titleKo: parsed.title_ko,
      summaryKo: parsed.summary_ko,
      supabaseProjectUrl: supabaseUrl,
    });

    if (thumb.ok && thumb.source === "ai_generated" && thumb.thumbnailUrl) {
      thumbnailRegenerated = true;
      await supabase
        .from("articles")
        .update({
          thumbnail_url: thumb.thumbnailUrl,
          ai_review_notes: [nowNote, AI_THUMBNAIL_REVIEW_NOTE].join("\n\n"),
        })
        .eq("id", input.articleId);
    } else if (!thumb.ok) {
      console.warn("[reviseArticleWithFeedback] thumbnail failed", thumb.error);
    }
  }

  if (input.revisionLogId) {
    await supabase
      .from("article_revision_logs")
      .update({
        revision_action: parsed.revision_notes_ko
          ? `AI 수정 완료: ${parsed.revision_notes_ko}`
          : "AI 수정 완료",
      })
      .eq("id", input.revisionLogId);
  }

  console.info("[reviseArticleWithFeedback] success", {
    articleId: input.articleId,
    thumbnailRegenerated,
  });

  return {
    ok: true,
    articleId: input.articleId,
    revisionNotesKo: parsed.revision_notes_ko,
    thumbnailRegenerated,
  };
}
