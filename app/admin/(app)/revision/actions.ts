"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { reviseArticleWithFeedback } from "@/lib/articles/ai/reviseArticleWithFeedback";
import { runEditorialReview } from "@/lib/articles/ai/runEditorialReview";
import type { AdminAiActionResult } from "@/lib/admin/aiActionTypes";
import { supabase } from "../../../../lib/supabase";

export async function runAiRevisionForArticle(
  articleId: string,
  revisionLogId: string | null,
  feedbackType: string,
  feedbackNote: string
): Promise<AdminAiActionResult> {
  const ai = await reviseArticleWithFeedback({
    articleId,
    feedbackType,
    feedbackNote,
    revisionLogId,
  });

  revalidatePath("/admin/revision");
  revalidatePath("/admin/review");
  revalidatePath(`/admin/review/${articleId}`);

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

  const thumbNote = ai.thumbnailRegenerated ? " 썸네일도 AI로 다시 만들었습니다." : "";
  return {
    ok: true,
    message: `AI 수정이 완료되었습니다.${thumbNote}`,
  };
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

  revalidatePath("/admin/revision");
  revalidatePath("/admin/review");
  revalidatePath(`/admin/review/${articleId}`);

  redirect("/admin/review");
}
