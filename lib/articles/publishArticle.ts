import "server-only";

import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";
import {
  isQuickReviewArticle,
  resolvePublishCopy,
  validateQuickPublishContent,
  type PublishArticleFields,
} from "@/lib/articles/quickPublishGuards";
import {
  evaluatePublishedSameEventGuard,
  loadRecentPublishedForSameEvent,
  type SameEventPublishedRow,
} from "@/lib/same-event/sameEventLookback";
import {
  approvedPublishExclusionReason,
  isApprovedReadyForHumanPublish,
} from "@/lib/articles/approvedPublishPolicy";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";
import { runReviewCompleteAndPublish } from "@/lib/articles/reviewCompletePublishCore";
import { createSupabaseReviewCompletePublishRpc } from "@/lib/articles/reviewCompletePublishRpc";

export type { PublishArticleFields };
export {
  isQuickReviewArticle,
  isPendingReviewArticle,
  resolvePublishCopy,
  validateQuickPublishContent,
} from "@/lib/articles/quickPublishGuards";

function slugify(value: string, fallback: string) {
  const base = (value || fallback || "article")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return base || fallback;
}

const PUBLISH_SELECT = `
  id,
  source,
  published_at,
  title_original,
  body_original,
  summary_original,
  title_translated,
  body_translated,
  summary_translated,
  title_ko,
  summary_ko,
  review_status,
  status,
  is_published,
  ai_review_status,
  ai_review_notes,
  thumbnail_url
`;

export type PublishArticleFieldsWithMeta = PublishArticleFields & {
  source?: string | null;
  thumbnail_url?: string | null;
};

export type SameEventPublishMatch = {
  id: string;
  source: string;
  title: string;
  publishedAt: string | null;
  /** Classifier relation when available (publish result metadata only). */
  relation?: string;
};

export type PublishArticleToLivePublicOptions = {
  /** When set, only transition from this review_status (race-safe). */
  requireReviewStatus?: string;
  /** Admin override for clear same-event block (quick_review etc.). */
  allowSameEventOverride?: boolean;
  /** Record human approver on publish (review complete / quick publish). */
  approvedBy?: string | null;
};

/** @internal — use publishApprovedArticleToLive() for approved-queue human publish. */
export type PublishArticleToLiveInternalOptions =
  PublishArticleToLivePublicOptions & {
    approvedHumanPublish?: boolean;
  };

export type PublishArticleToLiveResult =
  | {
      ok: true;
      publishedAt: string;
      firstPublish: boolean;
      softSameEventWarning?: SameEventPublishMatch;
      /** In-response metadata only — not persisted to DB audit tables. */
      sameEventPublishResultMetadata?: {
        wouldHaveBlocked: boolean;
        match?: SameEventPublishMatch;
        reason?: string;
      };
    }
  | {
      ok: false;
      error: string;
      step: string;
      sameEventMatch?: SameEventPublishMatch;
      softSameEventWarning?: SameEventPublishMatch;
    };

async function upsertLocalizations(
  client: ReturnType<typeof createServiceRoleSupabaseClient>["client"],
  articleId: string,
  copy: ReturnType<typeof resolvePublishCopy>
): Promise<void> {
  const koSlug = `${slugify(copy.koTitle || "article", "article")}-${articleId.slice(0, 8)}`;
  const enSlug = `${slugify(copy.enTitle || "article", "article")}-${articleId.slice(0, 8)}`;

  const { data: existingLocalizations, error: localizationFetchError } =
    await client
      .from("article_localizations")
      .select("id, locale")
      .eq("article_id", articleId);

  if (localizationFetchError) {
    throw new Error(localizationFetchError.message);
  }

  const existingKo = existingLocalizations?.find((row) => row.locale === "ko");
  const existingEn = existingLocalizations?.find((row) => row.locale === "en");

  if (existingKo) {
    const { error } = await client
      .from("article_localizations")
      .update({
        title: copy.koTitle || "기사",
        summary: copy.koSummary || null,
        body: copy.koBody || null,
        slug: koSlug,
        meta_description: copy.koSummary || null,
      })
      .eq("id", existingKo.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await client.from("article_localizations").insert({
      article_id: articleId,
      locale: "ko",
      title: copy.koTitle || "기사",
      summary: copy.koSummary || null,
      body: copy.koBody || null,
      slug: koSlug,
      meta_description: copy.koSummary || null,
    });
    if (error) throw new Error(error.message);
  }

  if (existingEn) {
    const { error } = await client
      .from("article_localizations")
      .update({
        title: copy.enTitle || "article",
        summary: copy.enSummary || null,
        body: copy.enBody || null,
        slug: enSlug,
        meta_description: copy.enSummary || null,
      })
      .eq("id", existingEn.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await client.from("article_localizations").insert({
      article_id: articleId,
      locale: "en",
      title: copy.enTitle || "article",
      summary: copy.enSummary || null,
      body: copy.enBody || null,
      slug: enSlug,
      meta_description: copy.enSummary || null,
    });
    if (error) throw new Error(error.message);
  }
}

function toSameEventMatch(row: SameEventPublishedRow): SameEventPublishMatch {
  return {
    id: row.id,
    source: row.source,
    title: row.title,
    publishedAt: row.published_at,
  };
}

/**
 * Shared publish core (approved queue + quick review).
 * Order: same-event guard → localizations → published flags.
 * Never calls OpenAI. Never deletes existing published articles.
 *
 * For 승인 완료 human publish use {@link publishApprovedArticleToLive} instead.
 */
export async function publishArticleToLive(
  articleId: string,
  options?: PublishArticleToLivePublicOptions
): Promise<PublishArticleToLiveResult> {
  return publishArticleToLiveInternal(articleId, options);
}

/** @internal Approved-queue path sets approvedHumanPublish via publishApprovedArticleToLive(). */
export async function publishArticleToLiveInternal(
  articleId: string,
  options?: PublishArticleToLiveInternalOptions
): Promise<PublishArticleToLiveResult> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error, step: envCheck.step };
  }

  const { client } = createServiceRoleSupabaseClient();

  const { data, error: fetchError } = await client
    .from("articles")
    .select(PUBLISH_SELECT)
    .eq("id", articleId)
    .maybeSingle();

  if (fetchError || !data) {
    return {
      ok: false,
      error: fetchError?.message || "기사를 찾을 수 없습니다.",
      step: "fetch",
    };
  }

  const article = data as PublishArticleFieldsWithMeta;

  if (article.is_published === true && article.status === "published") {
    return {
      ok: true,
      publishedAt: article.published_at?.trim() || new Date().toISOString(),
      firstPublish: false,
    };
  }

  if (
    options?.requireReviewStatus &&
    article.review_status !== options.requireReviewStatus
  ) {
    return {
      ok: false,
      error: `이 기사는 빠른 공개 대상이 아닙니다 (현재: ${article.review_status}).`,
      step: "status_guard",
    };
  }

  if (options?.approvedHumanPublish) {
    const exclusion = approvedPublishExclusionReason(article);
    if (exclusion) {
      return {
        ok: false,
        error: exclusion,
        step: "excluded",
      };
    }
    if (!isApprovedReadyForHumanPublish(article)) {
      return {
        ok: false,
        error: "승인 완료 상태가 아닙니다.",
        step: "status_guard",
      };
    }
  }

  const copy = resolvePublishCopy(article);
  let softSameEventWarning: SameEventPublishMatch | undefined;
  let sameEventPublishResultMetadata:
    | {
        wouldHaveBlocked: boolean;
        match?: SameEventPublishMatch;
        reason?: string;
      }
    | undefined;

  const skipSameEventHardBlock =
    options?.allowSameEventOverride === true ||
    options?.approvedHumanPublish === true;

  if (!skipSameEventHardBlock) {
    const published = await loadRecentPublishedForSameEvent();
    const guard = evaluatePublishedSameEventGuard(
      {
        title: copy.koTitle || copy.enTitle,
        summary: copy.koSummary || copy.enSummary,
        titleAlt: copy.enTitle || copy.koTitle,
        summaryAlt: copy.enSummary || copy.koSummary,
        source: article.source ?? null,
        publishedAt: article.published_at,
        hasThumbnail: Boolean(article.thumbnail_url?.trim()),
      },
      published,
      { excludeArticleId: articleId }
    );

    if (guard.blocked) {
      return {
        ok: false,
        error: `유사한 공개 기사가 있습니다: ${guard.match.title.slice(0, 120)}`,
        step: "same_event_guard",
        sameEventMatch: toSameEventMatch(guard.match),
      };
    }
    if (guard.softWarning) {
      softSameEventWarning = toSameEventMatch(guard.softWarning);
    }
  } else {
    const published = await loadRecentPublishedForSameEvent();
    const guard = evaluatePublishedSameEventGuard(
      {
        title: copy.koTitle || copy.enTitle,
        summary: copy.koSummary || copy.enSummary,
        titleAlt: copy.enTitle || copy.koTitle,
        summaryAlt: copy.enSummary || copy.koSummary,
        source: article.source ?? null,
        publishedAt: article.published_at,
        hasThumbnail: Boolean(article.thumbnail_url?.trim()),
      },
      published,
      { excludeArticleId: articleId }
    );
    if (guard.blocked) {
      sameEventPublishResultMetadata = {
        wouldHaveBlocked: true,
        match: {
          ...toSameEventMatch(guard.match),
          relation: "same_event",
        },
        reason: guard.reason,
      };
    } else if (guard.softWarning) {
      softSameEventWarning = toSameEventMatch(guard.softWarning);
    }
  }

  try {
    await upsertLocalizations(client, articleId, copy);
  } catch (err) {
    return {
      ok: false,
      error: String(err),
      step: "localizations",
    };
  }

  const existingPublishedAt = article.published_at?.trim() || null;
  const sitePublishedAt = existingPublishedAt ?? new Date().toISOString();
  const firstPublish = !existingPublishedAt;

  let updateQuery = client
    .from("articles")
    .update({
      ...ARTICLE_WORKFLOW.published,
      ...(firstPublish ? { published_at: sitePublishedAt } : {}),
      approved_at: new Date().toISOString(),
      ...(options?.approvedBy?.trim()
        ? { approved_by: options.approvedBy.trim() }
        : {}),
    })
    .eq("id", articleId)
    .eq("is_published", false);

  if (options?.requireReviewStatus) {
    updateQuery = updateQuery.eq("review_status", options.requireReviewStatus);
  }

  const { data: updated, error: updateError } = await updateQuery
    .select("id")
    .maybeSingle();

  if (updateError) {
    return { ok: false, error: updateError.message, step: "publish_update" };
  }
  if (!updated) {
    return {
      ok: false,
      error: "공개 상태 갱신에 실패했습니다 (이미 처리됐을 수 있음).",
      step: "publish_update",
    };
  }

  return {
    ok: true,
    publishedAt: sitePublishedAt,
    firstPublish,
    ...(softSameEventWarning ? { softSameEventWarning } : {}),
    ...(sameEventPublishResultMetadata
      ? { sameEventPublishResultMetadata }
      : {}),
  };
}

/**
 * One-click quick publish: content guard + publishArticleToLive.
 * Combines former approve → approved → publish into one transition.
 * No OpenAI.
 */
export async function quickPublishArticle(
  articleId: string,
  options?: { allowSameEventOverride?: boolean; approvedBy?: string | null }
): Promise<
  | PublishArticleToLiveResult
  | {
      ok: false;
      error: string;
      step: string;
      errors?: string[];
      warnings?: string[];
      sameEventMatch?: SameEventPublishMatch;
    }
> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error, step: envCheck.step };
  }

  const { client } = createServiceRoleSupabaseClient();
  const { data, error } = await client
    .from("articles")
    .select(PUBLISH_SELECT)
    .eq("id", articleId)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message || "기사를 찾을 수 없습니다.",
      step: "fetch",
    };
  }

  const article = data as PublishArticleFieldsWithMeta;
  if (!isQuickReviewArticle(article)) {
    return {
      ok: false,
      error: "빠른 검토 상태의 기사만 바로 공개할 수 있습니다.",
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

  return publishArticleToLive(articleId, {
    requireReviewStatus: ARTICLE_WORKFLOW.quickReview.review_status,
    allowSameEventOverride: options?.allowSameEventOverride,
    approvedBy: options?.approvedBy,
  });
}

/**
 * Review queue one-step publish: pending review → live via atomic RPC.
 * App runs content + SAME EVENT guards, then service_role calls
 * review_complete_and_publish_article (localizations + article status in one TX).
 * Does NOT fall back to non-atomic publishArticleToLive when RPC is missing.
 * Does not auto-publish approved-only (보관함) articles.
 */
export async function reviewCompleteAndPublishArticle(
  articleId: string,
  options?: { allowSameEventOverride?: boolean; approvedBy?: string | null }
): Promise<
  | PublishArticleToLiveResult
  | {
      ok: false;
      error: string;
      step: string;
      errors?: string[];
      warnings?: string[];
      sameEventMatch?: SameEventPublishMatch;
    }
> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error, step: envCheck.step };
  }

  const { client } = createServiceRoleSupabaseClient();

  const result = await runReviewCompleteAndPublish(
    articleId,
    {
      allowSameEventOverride: options?.allowSameEventOverride,
      approvedBy: options?.approvedBy?.trim() || "admin",
    },
    {
      fetchArticle: async (id) => {
        const { data, error } = await client
          .from("articles")
          .select(PUBLISH_SELECT)
          .eq("id", id)
          .maybeSingle();
        if (error || !data) {
          return {
            ok: false as const,
            error: error?.message || "기사를 찾을 수 없습니다.",
          };
        }
        return {
          ok: true as const,
          article: data as PublishArticleFieldsWithMeta,
        };
      },
      evaluateSameEvent: async ({ article, copy }) => {
        const published = await loadRecentPublishedForSameEvent();
        const guard = evaluatePublishedSameEventGuard(
          {
            title: copy.koTitle || copy.enTitle,
            summary: copy.koSummary || copy.enSummary,
            titleAlt: copy.enTitle || copy.koTitle,
            summaryAlt: copy.enSummary || copy.koSummary,
            source: article.source ?? null,
            publishedAt: article.published_at,
            hasThumbnail: Boolean(article.thumbnail_url?.trim()),
          },
          published,
          { excludeArticleId: article.id }
        );
        if (guard.blocked) {
          return { blocked: true as const, match: toSameEventMatch(guard.match) };
        }
        return {
          blocked: false as const,
          ...(guard.softWarning
            ? { softWarning: toSameEventMatch(guard.softWarning) }
            : {}),
        };
      },
      rpc: createSupabaseReviewCompletePublishRpc(client),
    }
  );

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      step: result.step,
      ...(result.errors ? { errors: result.errors } : {}),
      ...(result.warnings ? { warnings: result.warnings } : {}),
      ...(result.sameEventMatch
        ? { sameEventMatch: result.sameEventMatch }
        : {}),
    };
  }

  return {
    ok: true,
    publishedAt: result.publishedAt,
    firstPublish: result.firstPublish,
    ...(result.softSameEventWarning
      ? { softSameEventWarning: result.softSameEventWarning }
      : {}),
  };
}

/** Move quick_review → normal review queue (수정 필요). No OpenAI. */
export async function sendQuickReviewToReviewQueue(
  articleId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return { ok: false, error: envCheck.error };

  const { client } = createServiceRoleSupabaseClient();
  const { data, error } = await client
    .from("articles")
    .update({
      ...ARTICLE_WORKFLOW.review,
      revision_status: "none",
      is_published: false,
    })
    .eq("id", articleId)
    .eq("review_status", ARTICLE_WORKFLOW.quickReview.review_status)
    .eq("is_published", false)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "빠른 검토 기사를 찾을 수 없습니다." };
  return { ok: true };
}

/** Move quick_review → on_hold. No OpenAI. */
export async function holdQuickReviewArticle(
  articleId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return { ok: false, error: envCheck.error };

  const { client } = createServiceRoleSupabaseClient();
  const { data, error } = await client
    .from("articles")
    .update({
      status: "ready_for_human_review",
      review_status: "on_hold",
      is_published: false,
    })
    .eq("id", articleId)
    .eq("review_status", ARTICLE_WORKFLOW.quickReview.review_status)
    .eq("is_published", false)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "빠른 검토 기사를 찾을 수 없습니다." };
  return { ok: true };
}

/** Ensure an article sits in quick_review (e.g. already-enriched Discord retry). */
export async function moveArticleToQuickReview(
  articleId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return { ok: false, error: envCheck.error };

  const { client } = createServiceRoleSupabaseClient();
  const { data: existing, error: fetchError } = await client
    .from("articles")
    .select("id, review_status, status, is_published")
    .eq("id", articleId)
    .maybeSingle();

  if (fetchError || !existing) {
    return { ok: false, error: fetchError?.message || "기사를 찾을 수 없습니다." };
  }

  if ((existing as { is_published?: boolean }).is_published) {
    return { ok: false, error: "이미 공개된 기사입니다." };
  }

  if (
    (existing as { review_status?: string }).review_status ===
    ARTICLE_WORKFLOW.quickReview.review_status
  ) {
    return { ok: true };
  }

  const { error } = await client
    .from("articles")
    .update({ ...ARTICLE_WORKFLOW.quickReview })
    .eq("id", articleId)
    .eq("is_published", false);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
