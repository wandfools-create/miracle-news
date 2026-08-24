import "server-only";

import { chatCompletionJson } from "@/lib/openai/chatCompletionJson";
import {
  checkOpenAiEnv,
  getOpenAiCandidateModel,
} from "@/lib/openai/env";
import {
  AI_RECOMMEND_MAX_BATCH,
  AI_RECOMMEND_SYSTEM_PROMPT,
  buildAiRecommendUserPayload,
  candidateFreshnessCutoffIso,
  parseAiRecommendResponseItems,
} from "@/lib/collection-candidates/candidateRecommend";
import { applyAiRecommendPostProcess } from "@/lib/collection-candidates/candidateRecommendPostProcess";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

const MAX_SUMMARY_CHARS = 400;

export type RecommendCollectionCandidatesResult =
  | {
      ok: true;
      queued: number;
      updated: number;
      skippedAlready: number;
      openaiCalls: number;
      model: string;
    }
  | { ok: false; error: string; step: string; openaiCalls: number };

function truncateSummary(summary: string): string {
  const trimmed = summary.trim();
  if (trimmed.length <= MAX_SUMMARY_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_SUMMARY_CHARS - 1)}…`;
}

/**
 * Score unevaluated actionable candidates (title+summary only).
 * Skips rows that already have ai_recommended_at. Uses OPENAI_CANDIDATE_MODEL.
 * Never extracts article body / never promotes to review.
 */
export async function recommendUnevaluatedCollectionCandidates(): Promise<RecommendCollectionCandidatesResult> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error, step: envCheck.step, openaiCalls: 0 };
  }

  const openAi = checkOpenAiEnv();
  if (!openAi.ok) {
    return { ok: false, error: openAi.error, step: openAi.step, openaiCalls: 0 };
  }

  const model = getOpenAiCandidateModel();
  const { client } = createServiceRoleSupabaseClient();
  const cutoffIso = candidateFreshnessCutoffIso();

  const { data, error } = await client
    .from("collection_candidates")
    .select(
      "id, source, rss_title, rss_summary, rss_published_at, created_at, original_url, ai_recommended_at"
    )
    .in("status", ["pending", "enrich_failed", "enriching"])
    .is("ai_recommended_at", null)
    .or(
      `rss_published_at.gte.${cutoffIso},and(rss_published_at.is.null,created_at.gte.${cutoffIso})`
    )
    .order("rss_published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(AI_RECOMMEND_MAX_BATCH);

  if (error) {
    return { ok: false, error: error.message, step: "load_candidates", openaiCalls: 0 };
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    console.info("[collection-candidates] recommend skipped", {
      openaiCalls: 0,
      reason: "no unevaluated candidates in 48h window",
    });
    return {
      ok: true,
      queued: 0,
      updated: 0,
      skippedAlready: 0,
      openaiCalls: 0,
      model,
    };
  }

  const payload = rows.map((row) => ({
    id: String((row as { id: string }).id),
    source: String((row as { source?: string }).source ?? ""),
    title: String((row as { rss_title?: string }).rss_title ?? "").trim(),
    summary: truncateSummary(
      String((row as { rss_summary?: string | null }).rss_summary ?? "")
    ),
  }));

  console.info("[collection-candidates] recommend start", {
    openaiCalls: 1,
    model,
    queued: payload.length,
  });

  const completion = await chatCompletionJson<{ items?: unknown }>({
    step: "collection_candidates_recommend",
    system: AI_RECOMMEND_SYSTEM_PROMPT,
    user: buildAiRecommendUserPayload(payload),
    temperature: 0.2,
    model,
    timeoutMs: 90_000,
  });

  if (!completion.ok) {
    console.warn("[collection-candidates] recommend OpenAI failed", {
      openaiCalls: 1,
      model,
      error: completion.error,
    });
    return {
      ok: false,
      error: completion.error,
      step: completion.step,
      openaiCalls: 1,
    };
  }

  const parsed = parseAiRecommendResponseItems(completion.data.items);
  const byId = new Map(parsed.map((item) => [item.id, item]));

  const toPostProcess = rows
    .map((row) => {
      const scored = byId.get(String((row as { id: string }).id));
      if (!scored) return null;
      return {
        id: String((row as { id: string }).id),
        grade: scored.grade,
        score: scored.score,
        reason: scored.reason,
        title: String((row as { rss_title?: string }).rss_title ?? "").trim(),
        summary: truncateSummary(
          String((row as { rss_summary?: string | null }).rss_summary ?? "")
        ),
        source: String((row as { source?: string }).source ?? ""),
        originalUrl: String(
          (row as { original_url?: string }).original_url ?? ""
        ),
        rssPublishedAt:
          (row as { rss_published_at?: string | null }).rss_published_at ??
          null,
        createdAt: (row as { created_at?: string }).created_at ?? null,
      };
    })
    .filter(Boolean) as Parameters<typeof applyAiRecommendPostProcess>[0];

  const processed = applyAiRecommendPostProcess(toPostProcess);
  const processedById = new Map(processed.map((item) => [item.id, item]));

  const now = new Date().toISOString();
  let updated = 0;

  for (const row of payload) {
    const scored = processedById.get(row.id);
    if (!scored) continue;

    const { error: updateError } = await client
      .from("collection_candidates")
      .update({
        ai_recommend_grade: scored.grade,
        ai_recommend_score: scored.score,
        ai_recommend_reason: scored.reason,
        ai_recommended_at: now,
      })
      .eq("id", row.id)
      .is("ai_recommended_at", null);

    if (updateError) {
      console.warn("[collection-candidates] recommend update failed", {
        id: row.id,
        error: updateError.message,
      });
      continue;
    }
    updated += 1;
  }

  console.info("[collection-candidates] recommend done", {
    openaiCalls: 1,
    model,
    queued: payload.length,
    updated,
  });

  try {
    await client.from("collection_logs").insert({
      source: "RSS candidate AI recommend",
      checked_count: payload.length,
      saved_count: updated,
      duplicate_count: 0,
      failed_count: payload.length - updated,
      status: updated > 0 ? "success" : "failed",
      note: `candidate recommend · model=${model} openai_calls=1 queued=${payload.length} updated=${updated}`,
    });
  } catch (err) {
    console.warn("[collection-candidates] recommend collection_logs failed", err);
  }

  return {
    ok: true,
    queued: payload.length,
    updated,
    skippedAlready: 0,
    openaiCalls: 1,
    model,
  };
}
