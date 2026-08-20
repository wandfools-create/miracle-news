"use server";

import { revalidatePath } from "next/cache";
import { reviseArticleWithFeedback } from "@/lib/articles/ai/reviseArticleWithFeedback";
import type { AdminAiActionResult } from "@/lib/admin/aiActionTypes";
import { supabase } from "../../../../../lib/supabase";

function getArticleIdsFromFormData(formData: FormData) {
  return formData
    .getAll("articleIds")
    .map((value) => String(value))
    .filter(Boolean);
}

function revalidateAdminPages(articleId?: string) {
  revalidatePath("/admin/review");
  revalidatePath("/admin/on-hold");
  revalidatePath("/admin/approved");
  revalidatePath("/admin/revision");
  revalidatePath("/admin/rejected");

  if (articleId) {
    revalidatePath(`/admin/review/${articleId}`);
  }

  revalidatePath("/");
  revalidatePath("/ko");
  revalidatePath("/en");
}

function parseTopStoryOrder(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) {
    throw new Error("우선순위는 0 이상의 정수로 입력해 주세요.");
  }
  return num;
}

export async function setMainTopStory(articleId: string, orderRaw: string) {
  const topStoryOrder = parseTopStoryOrder(orderRaw);
  const { error } = await supabase
    .from("articles")
    .update({
      is_top_story: true,
      top_story_order: topStoryOrder,
    })
    .eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateAdminPages(articleId);
}

export async function clearMainTopStory(articleId: string) {
  const { error } = await supabase
    .from("articles")
    .update({
      is_top_story: false,
      top_story_order: 0,
    })
    .eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateAdminPages(articleId);
}

export async function approveArticleFromForm(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "").trim();
  if (!articleId) {
    console.error("[approveArticleFromForm] missing articleId");
    return;
  }
  await approveArticle(articleId);
}

export async function holdArticleFromForm(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "").trim();
  if (!articleId) {
    console.error("[holdArticleFromForm] missing articleId");
    return;
  }
  await holdArticle(articleId);
}

export async function approveArticleDetailFromForm(formData: FormData) {
  await approveArticleFromForm(formData);
}

export async function rejectArticleFromForm(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "").trim();
  const rejectedReason = String(formData.get("rejectedReason") ?? "");
  if (!articleId) {
    console.error("[rejectArticleFromForm] missing articleId");
    return;
  }
  await rejectArticle(articleId, rejectedReason);
}

export async function setMainTopStoryFromForm(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "").trim();
  const order = String(formData.get("topStoryOrder") ?? "");
  if (!articleId) {
    console.error("[setMainTopStoryFromForm] missing articleId");
    return;
  }
  await setMainTopStory(articleId, order);
}

export async function clearMainTopStoryFromForm(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "").trim();
  if (!articleId) {
    console.error("[clearMainTopStoryFromForm] missing articleId");
    return;
  }
  await clearMainTopStory(articleId);
}

export async function approveArticle(articleId: string) {
  const { error } = await supabase
    .from("articles")
    .update({
      status: "approved",
      review_status: "approved",
      revision_status: "none",
      is_published: false,
      approved_at: new Date().toISOString(),
      approved_by: "admin",
      rejected_reason: null,
    })
    .eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateAdminPages(articleId);
}

export async function bulkApproveArticles(formData: FormData) {
  const articleIds = getArticleIdsFromFormData(formData);

  if (articleIds.length === 0) return;

  const { error } = await supabase
    .from("articles")
    .update({
      status: "approved",
      review_status: "approved",
      revision_status: "none",
      is_published: false,
      approved_at: new Date().toISOString(),
      approved_by: "admin",
      rejected_reason: null,
    })
    .in("id", articleIds);

  if (error) {
    throw new Error(error.message);
  }

  revalidateAdminPages();
}

export async function holdArticle(articleId: string) {
  const { error } = await supabase
    .from("articles")
    .update({
      status: "ready_for_human_review",
      review_status: "on_hold",
      is_published: false,
    })
    .eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateAdminPages(articleId);
}

export async function bulkHoldArticles(formData: FormData) {
  const articleIds = getArticleIdsFromFormData(formData);

  if (articleIds.length === 0) return;

  const { error } = await supabase
    .from("articles")
    .update({
      status: "ready_for_human_review",
      review_status: "on_hold",
      is_published: false,
    })
    .in("id", articleIds);

  if (error) {
    throw new Error(error.message);
  }

  revalidateAdminPages();
}

export async function requestRevision(
  articleId: string,
  feedbackType: string,
  feedbackNote: string
) {
  const trimmedNote = feedbackNote.trim();

  const { data: logRow, error: logError } = await supabase
    .from("article_revision_logs")
    .insert({
      article_id: articleId,
      requested_by: "admin",
      feedback_type: feedbackType,
      feedback_note: trimmedNote,
      revision_status: "requested",
    })
    .select("id")
    .single();

  if (logError) {
    throw new Error(logError.message);
  }

  const { error: articleError } = await supabase
    .from("articles")
    .update({
      status: "needs_revision",
      review_status: "needs_revision",
      revision_status: "requested",
      revision_request: trimmedNote,
      is_published: false,
      ai_review_status: "pending",
      ai_review_notes: "수정 요청 접수 — AI 수정 대기",
    })
    .eq("id", articleId);

  if (articleError) {
    throw new Error(articleError.message);
  }

  revalidateAdminPages(articleId);
  return { revisionLogId: logRow?.id ?? null };
}

/** 수정 요청 저장 후 from-link와 동일한 OpenAI 기사 생성 로직으로 초안을 갱신합니다. */
export async function requestRevisionWithAi(
  articleId: string,
  feedbackType: string,
  feedbackNote: string
): Promise<AdminAiActionResult> {
  let revisionLogId: string | null = null;

  try {
    const saved = await requestRevision(articleId, feedbackType, feedbackNote);
    revisionLogId = saved.revisionLogId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[requestRevisionWithAi] save failed", message);
    return {
      ok: false,
      step: "save_revision",
      error: `[save_revision] ${message}`,
    };
  }

  const ai = await reviseArticleWithFeedback({
    articleId,
    feedbackType,
    feedbackNote,
    revisionLogId,
  });

  revalidateAdminPages(articleId);
  revalidatePath("/admin/revision");

  if (!ai.ok) {
    console.error("[requestRevisionWithAi] AI failed", ai);
    await supabase
      .from("articles")
      .update({
        ai_review_status: "fail",
        ai_review_notes: ai.uiMessage,
      })
      .eq("id", articleId);

    return { ok: false, step: ai.step, error: ai.uiMessage };
  }

  const thumbNote = ai.thumbnailRegenerated ? " (썸네일 AI 재생성)" : "";
  return {
    ok: true,
    message: `수정 요청을 저장하고 AI가 본문을 갱신했습니다.${thumbNote}`,
  };
}

export async function rejectArticle(articleId: string, rejectedReason: string) {
  const trimmedReason = rejectedReason.trim();

  const { error } = await supabase
    .from("articles")
    .update({
      status: "rejected",
      review_status: "rejected",
      is_published: false,
      rejected_reason: trimmedReason,
    })
    .eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateAdminPages(articleId);
}