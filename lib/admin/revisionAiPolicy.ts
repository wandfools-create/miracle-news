/**
 * Revision queue policy: entering needs_revision must NEVER call OpenAI.
 * AI rewrite runs only from an explicit admin button.
 */

export const REVISION_REQUEST_NOTE =
  "수정 요청 접수 — 기사 내용 보존. AI 수정은「AI로 수정」버튼으로 실행하세요.";

export const AI_REVISION_COST_CONFIRM =
  "AI 수정에는 OpenAI API 비용이 발생합니다. 계속할까요?";

/** DB fields touched when moving an article into the revision queue (status only). */
export function buildRequestRevisionArticlePatch(feedbackNote: string) {
  return {
    status: "needs_revision" as const,
    review_status: "needs_revision" as const,
    revision_status: "requested" as const,
    revision_request: feedbackNote.trim(),
    is_published: false,
    ai_review_notes: REVISION_REQUEST_NOTE,
  };
}

/** Content fields that must remain untouched on status-only revision entry. */
export const REVISION_PRESERVED_CONTENT_KEYS = [
  "title_ko",
  "title_translated",
  "title_original",
  "summary_ko",
  "summary_translated",
  "summary_original",
  "body_translated",
  "body_original",
  "thumbnail_url",
] as const;

export function requestRevisionPatchTouchesContent(
  patch: Record<string, unknown>
): boolean {
  return REVISION_PRESERVED_CONTENT_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(patch, key)
  );
}

/** Page load / refresh must never auto-start OpenAI revision. */
export function shouldAutoRunAiOnRevisionPageLoad(): boolean {
  return false;
}

/** UI label: only while an explicit AI revision request is in flight. */
export function aiRevisionBusyLabel(isAiPending: boolean): string {
  return isAiPending ? "OpenAI 수정 중…" : "AI로 수정";
}

export function isAiRevisionProcessingStatus(
  aiReviewStatus: string | null | undefined
): boolean {
  return aiReviewStatus === "processing";
}
