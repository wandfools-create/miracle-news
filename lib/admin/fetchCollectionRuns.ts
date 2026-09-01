import "server-only";

import { isCollectionRunsSchemaMissing } from "@/lib/collection-candidates/collectionRunsCore";
import type { CandidateRunRow } from "@/lib/collection-candidates/groupCandidatesByRun";
import { COLLECTION_CANDIDATE_RUN_INDEX_SELECT } from "@/lib/collection-candidates/types";
import { candidateFreshnessCutoffIso } from "@/lib/collection-candidates/candidateRecommend";
import {
  checkSupabaseServiceEnvWithDnsCached,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

const RECENT_RUNS_LIMIT = 40;
const RUN_INDEX_LIMIT = 500;

export type FetchedCollectionRun = {
  id: string;
  region: string;
  trigger_type: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  collected_count: number;
  new_candidate_count: number;
  duplicate_count: number;
  failed_count: number;
  error_summary: string | null;
  created_at: string;
};

export async function fetchRecentCollectionRuns(limit = RECENT_RUNS_LIMIT): Promise<{
  runs: FetchedCollectionRun[];
  schemaMissing: boolean;
}> {
  const envCheck = await checkSupabaseServiceEnvWithDnsCached();
  if (!envCheck.ok) return { runs: [], schemaMissing: false };

  try {
    const { client } = createServiceRoleSupabaseClient();
    const { data, error } = await client
      .from("collection_runs")
      .select(
        "id, region, trigger_type, started_at, finished_at, status, collected_count, new_candidate_count, duplicate_count, failed_count, error_summary, created_at"
      )
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isCollectionRunsSchemaMissing(error)) {
        return { runs: [], schemaMissing: true };
      }
      console.warn("[admin/collection-runs] fetch failed", {
        code: error.code,
        message: error.message?.slice(0, 160),
      });
      return { runs: [], schemaMissing: false };
    }

    return {
      runs: (data ?? []) as FetchedCollectionRun[],
      schemaMissing: false,
    };
  } catch {
    return { runs: [], schemaMissing: false };
  }
}

export async function fetchCandidateRunIndex(input?: {
  view?: string | null;
  limit?: number;
}): Promise<CandidateRunRow[]> {
  const envCheck = await checkSupabaseServiceEnvWithDnsCached();
  if (!envCheck.ok) return [];

  const { client } = createServiceRoleSupabaseClient();
  const cutoffIso = candidateFreshnessCutoffIso();
  const limit = input?.limit ?? RUN_INDEX_LIMIT;
  const view = input?.view?.trim() || "ai";

  let dbQuery = client
    .from("collection_candidates")
    .select(COLLECTION_CANDIDATE_RUN_INDEX_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (view === "older") {
    dbQuery = dbQuery.eq("status", "pending").or(
      `rss_published_at.lt.${cutoffIso},and(rss_published_at.is.null,created_at.lt.${cutoffIso})`
    );
  } else {
    dbQuery = dbQuery.or(
      `rss_published_at.gte.${cutoffIso},and(rss_published_at.is.null,created_at.gte.${cutoffIso})`
    );
  }

  const { data, error } = await dbQuery;
  if (error) {
    console.warn("[admin/collection-runs] index fetch failed", {
      code: error.code,
      message: error.message?.slice(0, 160),
    });
    return [];
  }

  return (data ?? []) as CandidateRunRow[];
}
