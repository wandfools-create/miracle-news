/**
 * Review-complete-and-publish orchestration (injectable deps, no server-only).
 * Authoritative write path is the RPC port — never falls back to non-atomic TS writes.
 */

import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";
import {
  isPendingReviewArticle,
  resolvePublishCopy,
  validateQuickPublishContent,
  type PublishArticleFields,
} from "@/lib/articles/quickPublishGuards";
import {
  REVIEW_COMPLETE_PUBLISH_NOT_READY_ERROR,
  type ReviewCompleteLocalizationPayload,
  type ReviewCompletePublishRpcPort,
} from "@/lib/articles/reviewCompletePublishRpc";

export type ReviewCompletePublishArticleRow = PublishArticleFields & {
  source?: string | null;
  thumbnail_url?: string | null;
};

export type SameEventGuardMatch = {
  id: string;
  source: string;
  title: string;
  publishedAt: string | null;
};

export type ReviewCompletePublishCoreResult =
  | {
      ok: true;
      publishedAt: string;
      firstPublish: boolean;
      softSameEventWarning?: SameEventGuardMatch;
    }
  | {
      ok: false;
      error: string;
      step: string;
      errors?: string[];
      warnings?: string[];
      sameEventMatch?: SameEventGuardMatch;
    };

export type ReviewCompletePublishCoreDeps = {
  fetchArticle: (
    articleId: string
  ) => Promise<
    | { ok: true; article: ReviewCompletePublishArticleRow }
    | { ok: false; error: string }
  >;
  /** Return blocked match or soft warning. Called only when override is false. */
  evaluateSameEvent: (input: {
    article: ReviewCompletePublishArticleRow;
    copy: ReturnType<typeof resolvePublishCopy>;
  }) => Promise<
    | { blocked: true; match: SameEventGuardMatch }
    | { blocked: false; softWarning?: SameEventGuardMatch }
  >;
  rpc: ReviewCompletePublishRpcPort;
};

export function slugifyPublishTitle(value: string, fallback: string): string {
  const base = (value || fallback || "article")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || fallback;
}

/** Build KO/EN payloads from DB article fields (never trust client localization). */
export function buildReviewCompleteLocalizationPayloads(
  article: PublishArticleFields
): { ko: ReviewCompleteLocalizationPayload; en: ReviewCompleteLocalizationPayload } {
  const copy = resolvePublishCopy(article);
  const koSlug = `${slugifyPublishTitle(copy.koTitle || "article", "article")}-${article.id.slice(0, 8)}`;
  const enSlug = `${slugifyPublishTitle(copy.enTitle || "article", "article")}-${article.id.slice(0, 8)}`;
  return {
    ko: {
      title: copy.koTitle || "기사",
      summary: copy.koSummary || null,
      body: copy.koBody || null,
      slug: koSlug,
      meta_description: copy.koSummary || null,
    },
    en: {
      title: copy.enTitle || "article",
      summary: copy.enSummary || null,
      body: copy.enBody || null,
      slug: enSlug,
      meta_description: copy.enSummary || null,
    },
  };
}

/**
 * Pick the next pending review article after a successful publish.
 * Re-reads the provided pending queue (server-sourced); ignores client next ids.
 */
export function pickNextPendingReviewArticleId(
  pendingIdsInOrder: string[],
  publishedArticleId: string
): string | null {
  const remaining = pendingIdsInOrder.filter((id) => id !== publishedArticleId);
  return remaining[0] ?? null;
}

export async function runReviewCompleteAndPublish(
  articleId: string,
  options: {
    allowSameEventOverride?: boolean;
    /** Must come from authenticated allowlisted admin on the server action. */
    approvedBy: string;
  },
  deps: ReviewCompletePublishCoreDeps
): Promise<ReviewCompletePublishCoreResult> {
  const fetched = await deps.fetchArticle(articleId);
  if (!fetched.ok) {
    return { ok: false, error: fetched.error, step: "fetch" };
  }

  const article = fetched.article;

  if (article.is_published === true && article.status === "published") {
    return {
      ok: true,
      publishedAt: article.published_at?.trim() || new Date().toISOString(),
      firstPublish: false,
    };
  }

  if (!isPendingReviewArticle(article)) {
    return {
      ok: false,
      error: "검토 대기 상태의 기사만 검토 완료 및 공개할 수 있습니다.",
      step: "status_guard",
    };
  }

  // Approved holding rows must never auto-publish through this path.
  if (
    article.review_status === ARTICLE_WORKFLOW.approved.review_status &&
    article.status === ARTICLE_WORKFLOW.approved.status &&
    article.is_published !== true
  ) {
    return {
      ok: false,
      error: "이전 승인 보관함 기사는 이 경로로 공개되지 않습니다.",
      step: "status_guard",
    };
  }

  const content = validateQuickPublishContent(article);
  if (!content.ok) {
    return {
      ok: false,
      error: content.errors.join(" "),
      step: "content_guard",
      errors: content.errors,
      warnings: content.warnings,
    };
  }

  const copy = resolvePublishCopy(article);
  let softSameEventWarning: SameEventGuardMatch | undefined;

  if (options.allowSameEventOverride !== true) {
    const guard = await deps.evaluateSameEvent({ article, copy });
    if (guard.blocked) {
      return {
        ok: false,
        error: `유사한 공개 기사가 있습니다: ${guard.match.title.slice(0, 120)}`,
        step: "same_event_guard",
        sameEventMatch: guard.match,
      };
    }
    if (guard.softWarning) softSameEventWarning = guard.softWarning;
  }

  const localizations = buildReviewCompleteLocalizationPayloads(article);
  const approvedBy = options.approvedBy.trim() || "admin";

  const outcome = await deps.rpc.call({
    articleId,
    approvedBy,
    ko: localizations.ko,
    en: localizations.en,
  });

  if (outcome.kind === "missing_function") {
    return {
      ok: false,
      error: REVIEW_COMPLETE_PUBLISH_NOT_READY_ERROR,
      step: "rpc_unavailable",
    };
  }

  if (outcome.kind === "transport_error") {
    return {
      ok: false,
      error: outcome.message,
      step: "rpc",
    };
  }

  if (!outcome.result.ok) {
    return {
      ok: false,
      error: outcome.result.error,
      step: outcome.result.step,
    };
  }

  return {
    ok: true,
    publishedAt: outcome.result.published_at,
    firstPublish: outcome.result.first_publish,
    ...(softSameEventWarning ? { softSameEventWarning } : {}),
  };
}
