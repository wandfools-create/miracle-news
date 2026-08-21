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

const CLAIMABLE_STATUSES = ["pending", "enrich_failed", "enriching"] as const;

export type PromoteCollectionCandidateResult =
  | { ok: true; articleId: string; alreadyEnriched?: boolean }
  | {
      ok: false;
      error: string;
      step: string;
      category?: RssEnrichFailureCategory;
      categoryLabel?: string;
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
}

/** Admin-selected enrich: from-link pipeline then review-queue insert. OpenAI only here. */
export async function promoteCollectionCandidate(input: {
  candidateId: string;
  selectedBy?: string | null;
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
      "id, source, original_url, rss_title, rss_guid, custom_unique_id, rss_published_at, status, article_id, enrich_attempt_count"
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

  if (row.status === "enriched" && row.article_id) {
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

  const pipeline = await runRssFromLinkPipeline({
    originalUrl: row.original_url,
    aiReviewNotes: [
      RSS_AI_REVIEW_NOTE_CANDIDATE,
      `[후보 ID] ${candidateId}`,
      `[선택] ${input.selectedBy ?? "admin"} · ${now}`,
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
  const publishedAt = f.publishedAt ?? row.rss_published_at ?? null;
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
    publishedAt,
    thumbnailUrl: f.thumbnailUrl,
    customUniqueId,
    aiReviewNotes: f.aiReviewNotes,
    autoGenerateAiThumbnail: false,
    category: f.category,
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

  if (completeError) {
    console.error("[collection-candidates] mark enriched failed", completeError);
  }

  console.info("[collection-candidates] enrich success", {
    candidateId,
    articleId: inserted.articleId,
  });

  return { ok: true, articleId: inserted.articleId };
}
