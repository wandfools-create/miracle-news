import "server-only";

import { candidateFreshnessCutoffIso } from "@/lib/collection-candidates/candidateRecommend";
import {
  selectMorningBriefItemsFromRows,
} from "@/lib/collection-candidates/morningBriefSelection";
import {
  collectMorningBriefRowsByPagination,
} from "@/lib/collection-candidates/morningBriefPagination";
import type { MorningBriefItem } from "@/lib/discord/morningBriefMessage";
import {
  COLLECTION_CANDIDATE_LIST_SELECT,
  type CollectionCandidateRow,
} from "@/lib/collection-candidates/types";
import {
  sourceKeysForCollectRegion,
  type CollectRegion,
} from "@/lib/rss/collectRegions";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

export { isMorningBriefSendEligible, selectMorningBriefItemsFromRows } from "@/lib/collection-candidates/morningBriefSelection";
export {
  collectMorningBriefRowsByPagination,
  MORNING_BRIEF_FETCH_PAGE_SIZE,
} from "@/lib/collection-candidates/morningBriefPagination";

const ACTIONABLE_STATUSES = ["pending", "enrich_failed", "enriching"] as const;

/** Actionable rows not yet sent to Discord; within 48h lookback (AI eval optional). */
export async function fetchMorningBriefCandidateRows(options?: {
  region?: CollectRegion | null;
}): Promise<
  | { ok: true; rows: CollectionCandidateRow[] }
  | { ok: false; error: string }
> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return { ok: false, error: envCheck.error };

  const { client } = createServiceRoleSupabaseClient();
  const cutoffIso = candidateFreshnessCutoffIso();

  return collectMorningBriefRowsByPagination(async (from, to) => {
    let query = client
      .from("collection_candidates")
      .select(COLLECTION_CANDIDATE_LIST_SELECT)
      .in("status", [...ACTIONABLE_STATUSES])
      .is("discord_brief_sent_at", null)
      .or(
        `rss_published_at.gte.${cutoffIso},and(rss_published_at.is.null,created_at.gte.${cutoffIso})`
      );

    if (options?.region) {
      query = query.in("source", sourceKeysForCollectRegion(options.region));
    }

    const { data, error } = await query
      .order("rss_published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);

    if (error) return { ok: false, error: error.message };
    return { ok: true, rows: (data ?? []) as CollectionCandidateRow[] };
  });
}

/** All eligible actionable items (no env throttle; AI eval not required). */
export async function fetchMorningBriefItems(options?: {
  region?: CollectRegion | null;
}): Promise<
  | { ok: true; items: MorningBriefItem[] }
  | { ok: false; error: string }
> {
  const loaded = await fetchMorningBriefCandidateRows(options);
  if (!loaded.ok) return loaded;
  return {
    ok: true,
    items: selectMorningBriefItemsFromRows(loaded.rows),
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

  const items = selectMorningBriefItemsFromRows([data as CollectionCandidateRow]);
  return items[0] ?? null;
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
