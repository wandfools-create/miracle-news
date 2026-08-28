import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";

export type ApprovedPublishArticleRow = {
  id: string;
  status: string | null;
  review_status: string | null;
  is_published: boolean | null;
};

/**
 * 승인 완료 큐에서 사람이 명시적으로 공개할 수 있는 상태인지 검증.
 * 서버가 제출된 ID를 다시 조회한 뒤 호출한다.
 */
export function isApprovedReadyForHumanPublish(
  article: ApprovedPublishArticleRow
): boolean {
  if (article.is_published === true) return true; // 멱등: 이미 공개
  if (article.status === ARTICLE_WORKFLOW.archived.status) return false;
  if (article.review_status === ARTICLE_WORKFLOW.archived.review_status) {
    return false;
  }
  return (
    article.status === ARTICLE_WORKFLOW.approved.status &&
    article.review_status === ARTICLE_WORKFLOW.approved.review_status &&
    article.is_published === ARTICLE_WORKFLOW.approved.is_published
  );
}

export function approvedPublishExclusionReason(
  article: ApprovedPublishArticleRow
): string | null {
  if (article.is_published === true) return null;
  if (
    article.status === ARTICLE_WORKFLOW.archived.status ||
    article.review_status === ARTICLE_WORKFLOW.archived.review_status
  ) {
    return "보관(archived) 상태";
  }
  if (
    article.status === ARTICLE_WORKFLOW.rejected.status ||
    article.review_status === ARTICLE_WORKFLOW.rejected.review_status
  ) {
    return "반려(rejected) 상태";
  }
  if (
    article.status === ARTICLE_WORKFLOW.revision.status ||
    article.review_status === ARTICLE_WORKFLOW.revision.review_status
  ) {
    return "수정 대기(needs_revision) 상태";
  }
  if (article.review_status === ARTICLE_WORKFLOW.quickReview.review_status) {
    return "빠른 검토(quick_review) 상태";
  }
  if (
    article.review_status !== ARTICLE_WORKFLOW.approved.review_status ||
    article.status !== ARTICLE_WORKFLOW.approved.status
  ) {
    return `승인 완료 상태가 아님 (status=${article.status ?? "없음"}, review=${article.review_status ?? "없음"})`;
  }
  if (article.is_published !== false) {
    return "이미 공개 처리됨";
  }
  return null;
}
