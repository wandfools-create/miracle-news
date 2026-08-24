import "server-only";

import { candidateFreshnessCutoffIso, normalizeAiRecommendGrade } from "@/lib/collection-candidates/candidateRecommend";
import {
  selectMorningBriefItemsFromRows,
} from "@/lib/collection-candidates/morningBriefSelection";
import type { MorningBriefItem } from "@/lib/discord/morningBriefMessage";
import {
  COLLECTION_CANDIDATE_LIST_SELECT,
  type CollectionCandidateRow,
} from "@/lib/collection-candidates/types";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

export { isMorningBriefSendEligible, selectMorningBriefItemsFromRows } from "@/lib/collection-candidates/morningBriefSelection";

const ACTIONABLE_STATUSES = ["pending", "enrich_failed", "enriching"] as const;

/** Rows not yet sent to Discord; AI evaluated; within 48h lookback. */
export async function fetchMorningBriefCandidateRows(): Promise<
  | { ok: true; rows: CollectionCandidateRow[] }
  | { ok: false; error: string }
> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return { ok: false, error: envCheck.error };

  const { client } = createServiceRoleSupabaseClient();
  const cutoffIso = candidateFreshnessCutoffIso();

  const { data, error } = await client
    .from("collection_candidates")
    .select(COLLECTION_CANDIDATE_LIST_SELECT)
    .in("status", [...ACTIONABLE_STATUSES])
    .not("ai_recommended_at", "is", null)
    .is("discord_brief_sent_at", null)
    .or(
      `rss_published_at.gte.${cutoffIso},and(rss_published_at.is.null,created_at.gte.${cutoffIso})`
    )
    .order("rss_published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as CollectionCandidateRow[] };
}

export async function fetchMorningBriefItems(maxItems: number): Promise<
  | { ok: true; items: MorningBriefItem[] }
  | { ok: false; error: string }
> {
  const loaded = await fetchMorningBriefCandidateRows();
  if (!loaded.ok) return loaded;
  return {
    ok: true,
    items: selectMorningBriefItemsFromRows(loaded.rows, maxItems),
  };
}

export async function markDiscordBriefSent(input: {
  candidateId: string;
  messageId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return { ok: false, error: envCheck.error };

  const { client } = createServiceRoleSupabaseClient();
  const now = new Date().toISOString();

  const { data, error } = await client
    .from("collection_candidates")
    .update({
      discord_brief_sent_at: now,
      discord_brief_message_id: input.messageId,
      updated_at: now,
    })
    .eq("id", input.candidateId)
    .is("discord_brief_sent_at", null)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return { ok: false, error: "already_sent_or_missing" };
  }
  return { ok: true };
}

export async function fetchCandidateForMorningBriefMessage(
  candidateId: string
): Promise<MorningBriefItem | null> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return null;

  const { client } = createServiceRoleSupabaseClient();
  const { data, error } = await client
    .from("collection_candidates")
    .select(COLLECTION_CANDIDATE_LIST_SELECT)
    .eq("id", candidateId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as CollectionCandidateRow;
  const grade = normalizeAiRecommendGrade(row.ai_recommend_grade);
  if (!grade) return null;

  return {
    id: row.id,
    source: row.source,
    feedLabel: row.feed_label,
    title: row.rss_title,
    originalUrl: row.original_url,
    rssPublishedAt: row.rss_published_at,
    aiRecommendGrade: grade,
    aiRecommendScore:
      typeof row.ai_recommend_score === "number" ? row.ai_recommend_score : null,
    aiRecommendReason: row.ai_recommend_reason,
  };
}

export async function fetchCandidateStatus(
  candidateId: string
): Promise<string | null> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return null;

  const { client } = createServiceRoleSupabaseClient();
  const { data, error } = await client
    .from("collection_candidates")
    .select("status")
    .eq("id", candidateId)
    .maybeSingle();

  if (error || !data) return null;
  return String((data as { status?: string }).status ?? "");
}
