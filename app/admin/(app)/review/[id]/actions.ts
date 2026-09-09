"use server";

import { revalidatePath } from "next/cache";
import type { AdminAiActionResult } from "@/lib/admin/aiActionTypes";
import { buildRequestRevisionArticlePatch } from "@/lib/admin/revisionAiPolicy";
import { revalidateAdminNavCountsCache } from "@/lib/admin/revalidateAdminNav";
import { supabase } from "../../../../../lib/supabase";

function getArticleIdsFromFormData(formData: FormData) {
  return formData
    .getAll("articleIds")
    .map((value) => String(value))
    .filter(Boolean);
}

function revalidateAdminPages(articleId?: string) {
  revalidateAdminNavCountsCache();
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

/**
 * Legacy export name retained for stale clients.
 * Must NOT approve-hold — delegates to atomic review-complete-and-publish.
 */
export async function approveArticleFromForm(formData: FormData) {
  if (!formData.get("returnTo")) {
    formData.set("returnTo", "detail");
  }
  const { reviewCompleteAndPublishFromForm } = await import("../publishActions");
  return reviewCompleteAndPublishFromForm(formData);
}

export async function holdArticleFromForm(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "").trim();
  if (!articleId) {
    console.error("[holdArticleFromForm] missing articleId");
    return;
  }
  await holdArticle(articleId);
}

/** @deprecated Same as approveArticleFromForm — atomic publish, not approve-hold. */
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

/**
 * Programmatic approve-hold removed. Use reviewCompleteAndPublishArticle
 * (pending → live) or publishApprovedArticleToLive (approved archive → live).
 */
export async function approveArticle(_articleId: string) {
  throw new Error(
    "approveArticle(승인 보관만)은 제거되었습니다. 검토 완료 및 공개(reviewCompleteAndPublishArticle)를 사용하세요."
  );
}

/**
 * Legacy export name retained for stale clients that still post to
 * “일괄 승인”. Delegates to atomic bulk review-complete-and-publish —
 * never writes approved + is_published=false holding state.
 */
export async function bulkApproveArticles(formData: FormData) {
  const { bulkReviewCompleteAndPublishFromForm } = await import(
    "../publishActions"
  );
  return bulkReviewCompleteAndPublishFromForm(formData);
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

  // Status-only move into revision queue — never call OpenAI or rewrite content.
  const { error: articleError } = await supabase
    .from("articles")
    .update(buildRequestRevisionArticlePatch(trimmedNote))
    .eq("id", articleId);

  if (articleError) {
    throw new Error(articleError.message);
  }

  revalidateAdminPages(articleId);
  return { revisionLogId: logRow?.id ?? null };
}

/**
 * @deprecated AI rewrite is no longer coupled to revision entry.
 * Saves status only; use runAiRevisionForArticle from the revision queue.
 */
export async function requestRevisionWithAi(
  articleId: string,
  feedbackType: string,
  feedbackNote: string
): Promise<AdminAiActionResult> {
  try {
    await requestRevision(articleId, feedbackType, feedbackNote);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[requestRevisionWithAi] save failed", message);
    return {
      ok: false,
      step: "save_revision",
      error: `[save_revision] ${message}`,
    };
  }

  return {
    ok: true,
    message:
      "수정 대기로 이동했습니다. 기사 내용은 그대로입니다. AI 수정은「수정 대기」의「AI로 수정」버튼에서 실행하세요.",
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