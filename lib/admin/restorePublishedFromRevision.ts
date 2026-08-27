/**
 * Restore previously published articles that were moved to the revision queue.
 * Status-only: never calls OpenAI, never rewrites content/localizations.
 *
 * Forward action (`sendToRevisionFromPublished` / bulk) updates ONLY:
 *   status, review_status, revision_status, is_published
 * Restore reverses those and clears revision-request metadata that would
 * misrepresent a live published article. Does NOT touch AI fields (forward
 * does not change them). Does NOT delete article_revision_logs.
 */

import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";

export const RESTORE_PUBLISHED_CONFIRM =
  "선택한 기사를 AI 수정 없이 기존 공개 내용 그대로 다시 공개합니다.";

/** Exact columns written by sendArticleToRevisionById / bulkSendToRevisionFromPublished. */
export const FORWARD_SEND_TO_REVISION_FIELDS = [
  "status",
  "review_status",
  "revision_status",
  "is_published",
] as const;

/** Revision-queue request metadata cleared so restored published rows look normal. */
export const REVISION_METADATA_CLEAR_FIELDS = [
  "revision_request",
  "revision_result_notes",
] as const;

/** Columns that must never appear on the restore patch. */
export const RESTORE_PRESERVED_CONTENT_KEYS = [
  "title_ko",
  "title_translated",
  "title_original",
  "summary_ko",
  "summary_translated",
  "summary_original",
  "body_translated",
  "body_original",
  "thumbnail_url",
  "published_at",
] as const;

/** AI fields forward action does not change — restore must leave them alone. */
export const RESTORE_PRESERVED_AI_KEYS = [
  "ai_review_status",
  "ai_review_notes",
] as const;

export type RestorePublishedEligibilityInput = {
  id?: string;
  status: string | null;
  review_status: string | null;
  revision_status?: string | null;
  is_published: boolean | null;
  published_at: string | null;
  hasKoLocalization: boolean;
  hasEnLocalization: boolean;
};

export type RestorePublishedFailReason =
  | "not_in_revision"
  | "no_publish_history"
  | "archived"
  | "missing_localization"
  | "already_published"
  | "not_found";

export type RestorePublishedEligibility =
  | { ok: true }
  | { ok: false; reason: RestorePublishedFailReason };

/**
 * Reverse of send-to-revision-from-published status flags,
 * plus nulling revision request metadata (not deleted audit logs).
 */
export function buildRestorePublishedFromRevisionUpdate() {
  return {
    status: ARTICLE_WORKFLOW.published.status,
    review_status: ARTICLE_WORKFLOW.published.review_status,
    revision_status: "none" as const,
    is_published: ARTICLE_WORKFLOW.published.is_published,
    revision_request: null,
    revision_result_notes: null,
  };
}

export function restorePublishedPatchTouchesContent(
  patch: Record<string, unknown>
): boolean {
  return RESTORE_PRESERVED_CONTENT_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(patch, key)
  );
}

export function restorePublishedPatchTouchesAiFields(
  patch: Record<string, unknown>
): boolean {
  return RESTORE_PRESERVED_AI_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(patch, key)
  );
}

export function evaluateRestorePublishedEligibility(
  article: RestorePublishedEligibilityInput
): RestorePublishedEligibility {
  if (
    article.status === "archived" ||
    article.review_status === "archived"
  ) {
    return { ok: false, reason: "archived" };
  }

  if (
    article.is_published === true &&
    article.status === ARTICLE_WORKFLOW.published.status
  ) {
    return { ok: false, reason: "already_published" };
  }

  const inRevision =
    article.status === ARTICLE_WORKFLOW.revision.status &&
    article.review_status === ARTICLE_WORKFLOW.revision.review_status &&
    article.revision_status === ARTICLE_WORKFLOW.revision.revision_status;

  if (!inRevision) {
    return { ok: false, reason: "not_in_revision" };
  }

  if (article.is_published !== false) {
    return { ok: false, reason: "not_in_revision" };
  }

  if (!article.published_at?.trim()) {
    return { ok: false, reason: "no_publish_history" };
  }

  if (!article.hasKoLocalization || !article.hasEnLocalization) {
    return { ok: false, reason: "missing_localization" };
  }

  return { ok: true };
}

export function restorePublishedFailReasonLabel(
  reason: RestorePublishedFailReason
): string {
  switch (reason) {
    case "not_in_revision":
      return "현재 수정 대기 상태가 아닙니다.";
    case "no_publish_history":
      return "이전 공개 이력(published_at)이 없어 복구할 수 없습니다.";
    case "archived":
      return "폐기(보관) 기사는 복구할 수 없습니다.";
    case "missing_localization":
      return "필요한 공개 localization(ko/en)이 없습니다.";
    case "already_published":
      return "이미 공개된 기사입니다.";
    case "not_found":
      return "기사를 찾을 수 없습니다.";
    default:
      return "복구할 수 없습니다.";
  }
}

export function restorePublishedConfirmMessage(count: number): string {
  return `${RESTORE_PUBLISHED_CONFIRM}\n\n대상 ${count}건`;
}

/** Pure helper: summarize mixed restore outcomes (e.g. 50-item bulk). */
export function summarizeRestoreItemOutcomes(
  items: Array<{ ok: boolean; reason?: string }>
): { successCount: number; skippedCount: number; failedCount: number } {
  const successCount = items.filter((i) => i.ok).length;
  const failedItems = items.filter((i) => !i.ok);
  const skippedReasons = new Set([
    "already_published",
    "not_in_revision",
    "no_publish_history",
    "archived",
    "missing_localization",
    "not_found",
  ]);
  const skippedCount = failedItems.filter((i) =>
    i.reason ? skippedReasons.has(i.reason) : false
  ).length;
  return {
    successCount,
    skippedCount,
    failedCount: failedItems.length - skippedCount,
  };
}
