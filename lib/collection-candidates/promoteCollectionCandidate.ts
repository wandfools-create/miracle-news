import "server-only";

import { insertReviewQueueArticle } from "@/lib/articles/insertReviewQueueArticle";
import type { CollectionCandidateRow } from "@/lib/collection-candidates/types";
import {
  categorizeEnrichFailure,
  type RssEnrichFailureCategory,
} from "@/lib/rss/enrichFailure";
import { RSS_AI_REVIEW_NOTE_CANDIDATE } from "@/lib/rss/feedSources";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

const CLAIMABLE_STATUSES = [
  "pending",
  "shortlisted",
  "enrich_failed",
  "enriching",
] as const;

export type PromoteCollectionCandidateResult =
  | { ok: true; articleId: string; alreadyEnriched?: boolean }
  | {
      ok: false;
      error: string;
      step: string;
      category?: RssEnrichFailureCategory;
      categoryLabel?: string;
      sameEventArticleId?: string;
      sameEventTitle?: string;
    };

async function markCandidateFailed(input: {
  candidateId: string;
  step: string;
  error: string;
  category?: RssEnrichFailureCategory;
  categoryLabel?: string;
}): Promise<void> {
  const classified =
    input.category && input.categoryLabel
      ? { category: input.category, categoryLabel: input.categoryLabel }
      : categorizeEnrichFailure(input.step, input.error);

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return;

  const { client } = createServiceRoleSupabaseClient();
  await client
    .from("collection_candidates")
    .update({
      status: "enrich_failed",
      enrich_step: input.step,
      enrich_error: `${classified.categoryLabel}: ${input.error}`.slice(0, 2000),
      enrich_category: classified.category,
    })
    .eq("id", input.candidateId);

  const { logExtractionAttempt } = await import("@/lib/extraction/logExtractionAttempt");
  const { mapEnrichCategoryToFailureCode } = await import(
    "@/lib/extraction/failureTaxonomy"
  );
  const { data: candidateRow } = await client
    .from("collection_candidates")
    .select("original_url, source")
    .eq("id", input.candidateId)
    .maybeSingle();
  if (candidateRow?.original_url) {
    await logExtractionAttempt({
      url: String(candidateRow.original_url),
      source: String(candidateRow.source ?? ""),
      failureCode: mapEnrichCategoryToFailureCode(classified.category),
      extractionMethod: input.step,
      metadata: { error: input.error.slice(0, 500) },
    });
  }
}

/** Admin-selected enrich: from-link pipeline then review-queue insert. OpenAI only here. */
export async function promoteCollectionCandidate(input: {
  candidateId: string;
  selectedBy?: string | null;
  /** Discord 빠른 발행: land in quick_review instead of pending review. */
  landingWorkflow?: "review" | "quick_review";
  /** Admin-pasted source body (preferred over auto-extract). */
  supplementalText?: string | null;
  /** Explicit force: allow short paste / length soft-save. Admin UI only. */
  adminForceCreate?: boolean;
  /** Same-outlet same-event override — not publish approval. */
  allowDuplicateAngleOverride?: boolean;
  duplicateOverrideReason?: string | null;
  duplicateOverrideActor?: string | null;
}): Promise<PromoteCollectionCandidateResult> {
  const candidateId = input.candidateId.trim();
  if (!candidateId) {
    return { ok: false, error: "후보 ID가 없습니다.", step: "validation" };
  }

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error, step: envCheck.step };
  }

  const { client } = createServiceRoleSupabaseClient();

  const { data: existing, error: fetchError } = await client
    .from("collection_candidates")
    .select(
      "id, source, original_url, rss_title, rss_summary, rss_title_ko, rss_summary_ko, rss_guid, custom_unique_id, rss_published_at, status, article_id, enrich_attempt_count, thumbnail_url, ai_recommend_grade, ai_recommend_score"
    )
    .eq("id", candidateId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, error: fetchError.message, step: "fetch_candidate" };
  }

  const row = existing as CollectionCandidateRow | null;
  if (!row) {
    return { ok: false, error: "후보를 찾을 수 없습니다.", step: "fetch_candidate" };
  }

  // Duplicate-angle policy before OpenAI enrich.
  {
    const { evaluatePublishedSameEventGuard, loadRecentPublishedForSameEvent } =
      await import("@/lib/same-event/sameEventLookback");
    const { evaluateDuplicateAngle } = await import(
      "@/lib/duplicate/evaluateDuplicateAngle"
    );
    const { recordDuplicateAngleOverride } = await import(
      "@/lib/duplicate/recordDuplicateOverride"
    );

    const published = await loadRecentPublishedForSameEvent();
    const publishedPool = published.map((p) => ({
      id: p.id,
      source: p.source,
      title: p.title,
      summary: p.summary,
      titleAlt: p.titleAlt,
      published_at: p.publishedAt,
    }));

    let existingByUrl: (typeof publishedPool)[number] | null = null;
    if (row.original_url?.trim()) {
      const { data: urlRow } = await client
        .from("articles")
        .select("id, source, title_ko, title_original, review_status, published_at")
        .eq("original_url", row.original_url.trim())
        .maybeSingle();
      if (urlRow) {
        existingByUrl = {
          id: String(urlRow.id),
          source: String(urlRow.source ?? ""),
          title: String(urlRow.title_ko || urlRow.title_original || ""),
          published_at: urlRow.published_at as string | null,
        };
      }
    }

    const angle = evaluateDuplicateAngle({
      originalUrl: row.original_url,
      source: row.source,
      title: row.rss_title,
      summary: row.rss_summary,
      titleAlt: row.rss_title_ko,
      existingByUrl,
      publishedPool,
    });

    if (angle.hardBlock) {
      return {
        ok: false,
        error: "동일 original_url 기사가 이미 있습니다.",
        step: "duplicate_exact_url",
        sameEventArticleId: angle.match?.id,
        sameEventTitle: angle.match?.title,
      };
    }

    if (angle.requiresOverride) {
      if (!input.allowDuplicateAngleOverride) {
        return {
          ok: false,
          error: `⚠️ ${angle.recommendedAction}`,
          step: "duplicate_angle_guard",
          sameEventArticleId: angle.match?.id,
          sameEventTitle: angle.match?.title,
        };
      }
      const reason = input.duplicateOverrideReason?.trim();
      if (!reason) {
        return {
          ok: false,
          error: "override 사유를 입력해 주세요.",
          step: "duplicate_angle_guard",
        };
      }
      await recordDuplicateAngleOverride({
        actor: input.duplicateOverrideActor ?? input.selectedBy ?? "admin",
        action: "promote_candidate",
        candidateId,
        matchedArticleId: angle.match?.id,
        originalUrl: row.original_url,
        source: row.source,
        classification: angle.class,
        overrideReason: reason,
        metadata: {
          sharedFacts: angle.sharedFacts ?? [],
          perspectiveDiff: angle.perspectiveDiff ?? null,
        },
      });
    } else {
      const guard = evaluatePublishedSameEventGuard(
        {
          title: row.rss_title,
          summary: row.rss_summary,
          titleAlt: row.rss_title_ko,
          summaryAlt: row.rss_summary_ko,
          source: row.source,
          publishedAt: row.rss_published_at,
          hasThumbnail: Boolean(
            (row as { thumbnail_url?: string | null }).thumbnail_url?.trim()
          ),
        },
        published
      );
      if (guard.blocked && angle.class !== "cross-outlet-same-event") {
        return {
          ok: false,
          error: `⚠️ 이미 유사한 공개 기사가 있습니다: ${guard.match.title.slice(0, 120)}`,
          step: "same_event_published",
          sameEventArticleId: guard.match.id,
          sameEventTitle: guard.match.title,
        };
      }
    }
  }

  if (row.status === "enriched" && row.article_id) {
    if (input.landingWorkflow === "quick_review") {
      const { moveArticleToQuickReview } = await import(
        "@/lib/articles/publishArticle"
      );
      const moved = await moveArticleToQuickReview(row.article_id);
      if (!moved.ok) {
        return { ok: false, error: moved.error, step: "move_quick_review" };
      }
    }
    return { ok: true, articleId: row.article_id, alreadyEnriched: true };
  }

  if (row.status === "dismissed" || row.status === "expired") {
    return {
      ok: false,
      error: "제외되었거나 만료된 후보는 기사로 만들 수 없습니다.",
      step: "status_guard",
    };
  }

  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await client
    .from("collection_candidates")
    .update({
      status: "enriching",
      selected_at: now,
      selected_by: input.selectedBy?.trim() || null,
      enrich_started_at: now,
      enrich_step: null,
      enrich_error: null,
      enrich_category: null,
      enrich_attempt_count: (row.enrich_attempt_count ?? 0) + 1,
    })
    .eq("id", candidateId)
    .in("status", [...CLAIMABLE_STATUSES])
    .select("id")
    .maybeSingle();

  if (claimError) {
    return { ok: false, error: claimError.message, step: "claim_candidate" };
  }
  if (!claimed) {
    return {
      ok: false,
      error: "이 후보는 지금 보강할 수 없는 상태입니다.",
      step: "claim_candidate",
    };
  }

  console.info("[collection-candidates] enrich start", {
    candidateId,
    originalUrl: row.original_url,
    selectedBy: input.selectedBy,
  });

  const { runRssFromLinkPipeline } = await import(
    "@/lib/rss/runRssFromLinkPipeline"
  );
  const { buildManualPromoteNoteLines } = await import(
    "@/lib/from-link/adminManualPromote"
  );
  const { normalizeSupplementalText } = await import(
    "@/lib/from-link/supplementalText"
  );

  const manualBody = normalizeSupplementalText(input.supplementalText);
  const adminForceCreate = input.adminForceCreate === true;

  const pipeline = await runRssFromLinkPipeline({
    originalUrl: row.original_url,
    adminArticleCreate: true,
    supplementalText: manualBody,
    adminForceCreate,
    aiReviewNotes: [
      RSS_AI_REVIEW_NOTE_CANDIDATE,
      `[후보 ID] ${candidateId}`,
      `[선택] ${input.selectedBy ?? "admin"} · ${now}`,
      ...buildManualPromoteNoteLines({
        manualSourceBodyUsed: Boolean(manualBody),
        adminForceCreate,
        manualBodyChars: manualBody?.length,
      }),
    ].join("\n"),
  });

  if (!pipeline.ok) {
    await markCandidateFailed({
      candidateId,
      step: pipeline.step,
      error: pipeline.error,
      category: pipeline.category,
      categoryLabel: pipeline.categoryLabel,
    });
    return {
      ok: false,
      error: pipeline.error,
      step: pipeline.step,
      category: pipeline.category,
      categoryLabel: pipeline.categoryLabel,
    };
  }

  const f = pipeline.fields;
  const sourcePublishedAt = f.sourcePublishedAt ?? row.rss_published_at ?? null;
  const customUniqueId =
    row.custom_unique_id?.trim() ||
    (row.rss_guid ? `rss:${row.source}:${row.rss_guid}` : `rss:${row.source}:${row.original_url}`);

  const inserted = await insertReviewQueueArticle({
    source: f.source,
    originalUrl: f.originalUrl,
    canonicalUrl: null,
    titleOriginal: f.titleOriginal,
    titleKo: f.titleKo,
    summaryOriginal: f.summaryOriginal,
    summaryKo: f.summaryKo,
    bodyOriginal: f.bodyOriginal,
    bodyKo: f.bodyKo,
    languageOriginal: f.languageOriginal,
    languageTranslated: f.languageTranslated,
    sourceCountry: f.sourceCountry,
    sourceSection: f.sourceSection,
    sourcePublishedAt,
    thumbnailUrl: f.thumbnailUrl,
    customUniqueId,
    aiReviewNotes: f.aiReviewNotes,
    autoGenerateAiThumbnail: false,
    category: f.category,
    topicKey: f.topicKey,
    topicLabel: f.topicLabel,
    editorialPriority: f.editorialPriority,
    landingWorkflow: input.landingWorkflow ?? "review",
  });

  if (!inserted.ok) {
    if (inserted.duplicateArticleId) {
      const completedAt = new Date().toISOString();
      await client
        .from("collection_candidates")
        .update({
          status: "enriched",
          article_id: inserted.duplicateArticleId,
          enrich_completed_at: completedAt,
          enrich_step: null,
          enrich_error: null,
          enrich_category: null,
        })
        .eq("id", candidateId);

      if (input.landingWorkflow === "quick_review") {
        const { moveArticleToQuickReview } = await import(
          "@/lib/articles/publishArticle"
        );
        await moveArticleToQuickReview(inserted.duplicateArticleId);
      }

      return {
        ok: true,
        articleId: inserted.duplicateArticleId,
        alreadyEnriched: true,
      };
    }

    await markCandidateFailed({
      candidateId,
      step: inserted.step,
      error: inserted.error,
    });
    return {
      ok: false,
      error: inserted.error,
      step: inserted.step,
    };
  }

  const completedAt = new Date().toISOString();
  const { error: completeError } = await client
    .from("collection_candidates")
    .update({
      status: "enriched",
      article_id: inserted.articleId,
      enrich_completed_at: completedAt,
      enrich_step: null,
      enrich_error: null,
      enrich_category: null,
    })
    .eq("id", candidateId);

  // Snapshot denorm only when ARTICLES_AI_RECOMMEND_SNAPSHOT=1 (post-migration).
  // Pre-migration: skip silently — home ranking joins collection_candidates.article_id.
  {
    const { maybeWriteArticleAiRecommendSnapshot } = await import(
      "@/lib/home/articlesAiRecommendCapability"
    );
    await maybeWriteArticleAiRecommendSnapshot({
      client,
      articleId: inserted.articleId,
      grade: (row as { ai_recommend_grade?: string | null }).ai_recommend_grade,
      score: (row as { ai_recommend_score?: number | null }).ai_recommend_score,
    });
  }

  if (completeError) {
    console.error("[collection-candidates] mark enriched failed", completeError);
  }

  console.info("[collection-candidates] enrich success", {
    candidateId,
    articleId: inserted.articleId,
  });

  return { ok: true, articleId: inserted.articleId };
}
