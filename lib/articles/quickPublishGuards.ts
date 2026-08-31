import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";

export type PublishArticleFields = {
  id: string;
  published_at: string | null;
  title_original: string | null;
  body_original: string | null;
  summary_original: string | null;
  title_translated: string | null;
  body_translated: string | null;
  summary_translated: string | null;
  title_ko: string | null;
  summary_ko: string | null;
  review_status: string | null;
  status: string | null;
  is_published: boolean | null;
  ai_review_status: string | null;
  ai_review_notes: string | null;
};

export function resolvePublishCopy(article: PublishArticleFields) {
  const koTitle =
    article.title_ko?.trim() ||
    article.title_translated?.trim() ||
    article.title_original?.trim() ||
    "";
  const koSummary =
    article.summary_ko?.trim() ||
    article.summary_translated?.trim() ||
    article.summary_original?.trim() ||
    "";
  const koBody =
    article.body_translated?.trim() || article.body_original?.trim() || "";
  const enTitle = article.title_original?.trim() || "";
  const enSummary = article.summary_original?.trim() || "";
  const enBody = article.body_original?.trim() || "";
  return { koTitle, koSummary, koBody, enTitle, enSummary, enBody };
}

/**
 * Blocks empty core fields. Quality warnings (ai_review_status) are not blockers.
 */
export function validateQuickPublishContent(article: PublishArticleFields): {
  ok: boolean;
  errors: string[];
  warnings: string[];
} {
  const { koTitle, koSummary, koBody } = resolvePublishCopy(article);
  const errors: string[] = [];
  if (!koTitle) errors.push("제목이 비어 있습니다.");
  if (!koBody) errors.push("본문이 비어 있습니다.");
  if (!koSummary) errors.push("요약이 비어 있습니다.");

  const warnings: string[] = [];
  if (
    article.ai_review_status === "fail" ||
    article.ai_review_status === "warning"
  ) {
    warnings.push(
      `AI 품질 신호: ${article.ai_review_status}${
        article.ai_review_notes?.trim()
          ? ` — ${article.ai_review_notes.trim().slice(0, 200)}`
          : ""
      }`
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function isQuickReviewArticle(article: {
  review_status?: string | null;
  status?: string | null;
  is_published?: boolean | null;
}): boolean {
  return (
    article.review_status === ARTICLE_WORKFLOW.quickReview.review_status &&
    article.status === ARTICLE_WORKFLOW.quickReview.status &&
    article.is_published !== true
  );
}

export function isPendingReviewArticle(article: {
  review_status?: string | null;
  status?: string | null;
  is_published?: boolean | null;
}): boolean {
  return (
    article.review_status === ARTICLE_WORKFLOW.review.review_status &&
    article.status === ARTICLE_WORKFLOW.review.status &&
    article.is_published !== true
  );
}
