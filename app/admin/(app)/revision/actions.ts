"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { revalidateAdminNavCountsCache } from "@/lib/admin/revalidateAdminNav";
import { reviseArticleWithFeedback } from "@/lib/articles/ai/reviseArticleWithFeedback";
import { runEditorialReview } from "@/lib/articles/ai/runEditorialReview";
import type { AdminAiActionResult } from "@/lib/admin/aiActionTypes";
import { isAiRevisionProcessingStatus } from "@/lib/admin/revisionAiPolicy";
import { supabase } from "../../../../lib/supabase";

function revalidateRevisionPages(articleId: string) {
  revalidateAdminNavCountsCache();
  revalidatePath("/admin/revision");
  revalidatePath("/admin/review");
  revalidatePath(`/admin/review/${articleId}`);
}

/** Lazy-load body for manual edit (list queries omit body columns). */
export async function fetchRevisionArticleBody(
  articleId: string
): Promise<{ ok: true; bodyKo: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("articles")
    .select("body_translated, body_original")
    .eq("id", articleId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "기사를 찾을 수 없습니다." };
  }

  const bodyKo =
    (data.body_translated ?? "").trim() ||
    (data.body_original ?? "").trim() ||
    "";

  return { ok: true, bodyKo };
}

/**
 * Explicit AI rewrite only — never call from page load or status transitions.
 */
export async function runAiRevisionForArticle(
  articleId: string,
  revisionLogId: string | null,
  feedbackType: string,
  feedbackNote: string
): Promise<AdminAiActionResult> {
  const { data: row, error: fetchError } = await supabase
    .from("articles")
    .select("id, ai_review_status")
    .eq("id", articleId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, step: "fetch", error: fetchError.message };
  }
  if (!row) {
    return { ok: false, step: "fetch", error: "기사를 찾을 수 없습니다." };
  }
  if (isAiRevisionProcessingStatus(row.ai_review_status)) {
    return {
      ok: false,
      step: "busy",
      error: "이미 AI 수정이 진행 중입니다. 잠시 후 다시 시도하세요.",
    };
  }

  const { error: lockError } = await supabase
    .from("articles")
    .update({
      ai_review_status: "processing",
      ai_review_notes: "OpenAI 수정 중…",
    })
    .eq("id", articleId)
    .neq("ai_review_status", "processing");

  if (lockError) {
    return { ok: false, step: "lock", error: lockError.message };
  }

  const ai = await reviseArticleWithFeedback({
    articleId,
    feedbackType,
    feedbackNote,
    revisionLogId,
  });

  revalidateRevisionPages(articleId);

  if (!ai.ok) {
    console.error("[runAiRevisionForArticle]", ai);
    await supabase
      .from("articles")
      .update({
        ai_review_status: "fail",
        ai_review_notes: ai.uiMessage,
      })
      .eq("id", articleId);

    return { ok: false, step: ai.step, error: ai.uiMessage };
  }

  const thumbNote = ai.thumbnailRegenerated
    ? " 썸네일도 AI로 다시 만들었습니다."
    : "";
  return {
    ok: true,
    message: `AI 수정이 완료되었습니다.${thumbNote}`,
  };
}

/** Manual edit — OpenAI never called. */
export async function saveManualRevisionEdit(
  articleId: string,
  fields: {
    titleKo: string;
    summaryKo: string;
    bodyKo: string;
  }
): Promise<AdminAiActionResult> {
  const titleKo = fields.titleKo.trim();
  const summaryKo = fields.summaryKo.trim();
  const bodyKo = fields.bodyKo.trim();

  if (!titleKo || !summaryKo || !bodyKo) {
    return {
      ok: false,
      step: "validate",
      error: "제목, 요약, 본문을 모두 입력해 주세요.",
    };
  }

  const { error } = await supabase
    .from("articles")
    .update({
      title_ko: titleKo,
      summary_ko: summaryKo,
      title_translated: titleKo,
      summary_translated: summaryKo,
      body_translated: bodyKo,
      ai_review_notes: "수동 수정 저장 (OpenAI 미사용)",
    })
    .eq("id", articleId)
    .eq("review_status", "needs_revision");

  if (error) {
    return { ok: false, step: "update", error: error.message };
  }

  const { data: koLoc } = await supabase
    .from("article_localizations")
    .select("id")
    .eq("article_id", articleId)
    .eq("locale", "ko")
    .maybeSingle();

  if (koLoc?.id) {
    await supabase
      .from("article_localizations")
      .update({
        title: titleKo,
        summary: summaryKo,
        body: bodyKo,
        meta_description: summaryKo,
      })
      .eq("id", koLoc.id);
  }

  revalidateRevisionPages(articleId);
  return { ok: true, message: "수동 수정을 저장했습니다." };
}

export async function sendBackToReview(
  articleId: string,
  revisionLogId: string | null,
  feedbackType: string | null,
  feedbackNote: string | null
) {
  const review = await runEditorialReview({
    articleId,
    feedbackType,
    feedbackNote,
  });

  if (!review.ok) {
    console.error("[sendBackToReview] editorial review failed", review);
    redirect(
      `/admin/revision?aiError=${encodeURIComponent(review.uiMessage)}`
    );
  }

  if (revisionLogId) {
    const { error: revisionError } = await supabase
      .from("article_revision_logs")
      .update({
        revision_status: "revised",
        revision_action: `ready for re-review (AI: ${review.status})`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", revisionLogId);

    if (revisionError) {
      throw new Error(revisionError.message);
    }
  }

  const { error: articleError } = await supabase
    .from("articles")
    .update({
      status: "ready_for_human_review",
      review_status: "pending",
      revision_status: "revised",
      rejected_reason: null,
    })
    .eq("id", articleId);

  if (articleError) {
    throw new Error(articleError.message);
  }

  revalidateRevisionPages(articleId);

  redirect("/admin/review");
}
