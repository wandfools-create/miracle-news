/**
 * Admin soft-discard for on-hold / revision queue articles.
 * Reuses status/review_status = archived (no hard DELETE, no migration).
 */

import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";

/** Queues that expose the 폐기 button. */
export const DISCARDABLE_REVIEW_STATUSES = [
  "on_hold",
  "needs_revision",
] as const;

export type DiscardableReviewStatus =
  (typeof DISCARDABLE_REVIEW_STATUSES)[number];

export type DiscardEligibilityInput = {
  id?: string;
  status: string | null;
  review_status: string | null;
  is_published: boolean | null;
};

export type DiscardEligibility =
  | { ok: true }
  | { ok: false; reason: "published" | "not_discardable_queue" | "already_archived" };

export type RestoreEligibility =
  | { ok: true }
  | { ok: false; reason: "not_archived" | "published" };

export function isDiscardableReviewStatus(
  reviewStatus: string | null | undefined
): reviewStatus is DiscardableReviewStatus {
  return (
    reviewStatus === "on_hold" || reviewStatus === "needs_revision"
  );
}

/** Soft-discard payload — never hard-deletes the article row. */
export function buildDiscardArticleUpdate() {
  return {
    status: ARTICLE_WORKFLOW.archived.status,
    review_status: ARTICLE_WORKFLOW.archived.review_status,
    is_published: false as const,
  };
}

/**
 * Restore discarded (archived) articles to a safe review queue state.
 * Does not approve or publish. Original hold/revision is not stored
 * without a dedicated column — pending review is the safe default.
 */
export function buildRestoreDiscardedArticleUpdate() {
  return {
    status: ARTICLE_WORKFLOW.review.status,
    review_status: ARTICLE_WORKFLOW.review.review_status,
    revision_status: "none" as const,
    is_published: false as const,
  };
}

export function evaluateDiscardEligibility(
  article: DiscardEligibilityInput
): DiscardEligibility {
  if (article.is_published === true || article.status === "published") {
    return { ok: false, reason: "published" };
  }
  if (
    article.status === "archived" &&
    article.review_status === "archived"
  ) {
    return { ok: false, reason: "already_archived" };
  }
  if (!isDiscardableReviewStatus(article.review_status)) {
    return { ok: false, reason: "not_discardable_queue" };
  }
  return { ok: true };
}

export function evaluateRestoreEligibility(
  article: DiscardEligibilityInput
): RestoreEligibility {
  if (article.is_published === true || article.status === "published") {
    return { ok: false, reason: "published" };
  }
  if (
    article.status !== "archived" ||
    article.review_status !== "archived"
  ) {
    return { ok: false, reason: "not_archived" };
  }
  return { ok: true };
}

/** Single confirm copy — no second confirmation step. */
export function discardConfirmMessage(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return (
    `선택한 기사 ${n}건을 폐기하시겠습니까?\n` +
    `폐기된 기사는 기본 작업 목록에서 제외됩니다.`
  );
}

export function partitionDiscardCandidates<T extends DiscardEligibilityInput>(
  rows: T[]
): {
  discardable: T[];
  blocked: Array<T & { blockReason: DiscardEligibility & { ok: false } }>;
} {
  const discardable: T[] = [];
  const blocked: Array<T & { blockReason: DiscardEligibility & { ok: false } }> =
    [];

  for (const row of rows) {
    const eligibility = evaluateDiscardEligibility(row);
    if (eligibility.ok) {
      discardable.push(row);
    } else {
      blocked.push({ ...row, blockReason: eligibility });
    }
  }

  return { discardable, blocked };
}

/** True when discarded articles must stay out of live / work queues. */
export function isExcludedFromWorkQueues(article: {
  status: string | null;
  review_status: string | null;
  is_published: boolean | null;
}): boolean {
  if (article.is_published === true) return false;
  return (
    article.status === "archived" && article.review_status === "archived"
  );
}

export function isVisibleOnPublishedList(article: {
  status: string | null;
  review_status: string | null;
  is_published: boolean | null;
}): boolean {
  return (
    article.is_published === true &&
    article.status === "published" &&
    article.review_status === "approved"
  );
}
