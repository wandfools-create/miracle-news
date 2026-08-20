import "server-only";

import {
  COLLECTION_CANDIDATE_LIST_SELECT,
  type CollectionCandidateRow,
  type CollectionCandidateStatus,
} from "@/lib/collection-candidates/types";
import {
  dateFilterRange,
  parseCandidateListQuery,
  type CandidateListQuery,
} from "@/lib/collection-candidates/candidateListQuery";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

export type FetchCollectionCandidatesResult = {
  candidates: CollectionCandidateRow[];
  error: { code?: string; message: string } | null;
  statusFilter: CollectionCandidateStatus | "all" | "actionable";
  query: CandidateListQuery;
};

const ACTIONABLE_STATUSES: CollectionCandidateStatus[] = [
  "pending",
  "enrich_failed",
  "enriching",
];

export async function fetchCollectionCandidates(input?: {
  status?: string | null;
  source?: string | null;
  date?: string | null;
  limit?: number;
}): Promise<FetchCollectionCandidatesResult> {
  const query = parseCandidateListQuery({
    status: input?.status ?? undefined,
    source: input?.source ?? undefined,
    date: input?.date ?? undefined,
  });
  const limit = input?.limit ?? 100;

  let statusFilter: FetchCollectionCandidatesResult["statusFilter"] = "all";
  if (query.status === "all") {
    statusFilter = "all";
  } else if (query.status === "actionable") {
    statusFilter = "actionable";
  } else {
    statusFilter = query.status as CollectionCandidateStatus;
  }

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return {
      candidates: [],
      error: { message: envCheck.error },
      statusFilter,
      query,
    };
  }

  const { client } = createServiceRoleSupabaseClient();

  let dbQuery = client
    .from("collection_candidates")
    .select(COLLECTION_CANDIDATE_LIST_SELECT)
    .order("rss_published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (statusFilter === "actionable") {
    dbQuery = dbQuery.in("status", ACTIONABLE_STATUSES);
  } else if (statusFilter !== "all") {
    dbQuery = dbQuery.eq("status", statusFilter);
  }

  if (query.source !== "all") {
    dbQuery = dbQuery.eq("source", query.source);
  }

  const range = dateFilterRange(query.date);
  if (range) {
    dbQuery = dbQuery.or(
      `rss_published_at.gte.${range.from},and(rss_published_at.is.null,created_at.gte.${range.from})`
    );
  }

  const { data, error } = await dbQuery;

  if (error) {
    console.error("[admin/collection-candidates] fetch failed", error);
    return {
      candidates: [],
      error: { code: error.code, message: error.message },
      statusFilter,
      query,
    };
  }

  return {
    candidates: (data ?? []) as CollectionCandidateRow[],
    error: null,
    statusFilter,
    query,
  };
}

export async function countActionableCollectionCandidates(): Promise<number> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    console.warn("[admin/collection-candidates] count skipped", envCheck.error);
    return 0;
  }

  const { client } = createServiceRoleSupabaseClient();
  const { count, error } = await client
    .from("collection_candidates")
    .select("id", { count: "exact", head: true })
    .in("status", ACTIONABLE_STATUSES);

  if (error) {
    console.warn("[admin/collection-candidates] count failed", error);
    return 0;
  }
  return count ?? 0;
}
