import "server-only";

import { candidateFreshnessCutoffIso } from "@/lib/collection-candidates/candidateRecommend";
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
  view?: string | null;
  status?: string | null;
  source?: string | null;
  date?: string | null;
  category?: string | null;
  limit?: number;
}): Promise<FetchCollectionCandidatesResult> {
  const query = parseCandidateListQuery({
    view: input?.view ?? undefined,
    status: input?.status ?? undefined,
    source: input?.source ?? undefined,
    date: input?.date ?? undefined,
    category: input?.category ?? undefined,
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
  const cutoffIso = candidateFreshnessCutoffIso();

  let dbQuery = client
    .from("collection_candidates")
    .select(COLLECTION_CANDIDATE_LIST_SELECT)
    .order("rss_published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (statusFilter === "shortlisted") {
    dbQuery = dbQuery.eq("status", "shortlisted");
  } else if (query.view === "ai" || query.view === "recent") {
    if (query.view === "recent") {
      dbQuery = dbQuery.eq("status", "pending");
    } else if (statusFilter === "actionable") {
      dbQuery = dbQuery.in("status", ACTIONABLE_STATUSES);
    } else if (statusFilter !== "all") {
      dbQuery = dbQuery.eq("status", statusFilter);
    }

    const range = dateFilterRange(query.date);
    const fromIso =
      range && range.from > cutoffIso ? range.from : cutoffIso;
    dbQuery = dbQuery.or(
      `rss_published_at.gte.${fromIso},and(rss_published_at.is.null,created_at.gte.${fromIso})`
    );
  } else if (query.view === "older") {
    dbQuery = dbQuery.eq("status", "pending");
    dbQuery = dbQuery.or(
      `rss_published_at.lt.${cutoffIso},and(rss_published_at.is.null,created_at.lt.${cutoffIso})`
    );
  } else if (statusFilter === "actionable") {
    dbQuery = dbQuery.in("status", ACTIONABLE_STATUSES);
  } else if (statusFilter !== "all") {
    dbQuery = dbQuery.eq("status", statusFilter);
  }

  if (query.source !== "all") {
    dbQuery = dbQuery.eq("source", query.source);
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
  const cutoffIso = candidateFreshnessCutoffIso();
  const { count, error } = await client
    .from("collection_candidates")
    .select("id", { count: "exact", head: true })
    .in("status", ACTIONABLE_STATUSES)
    .or(
      `rss_published_at.gte.${cutoffIso},and(rss_published_at.is.null,created_at.gte.${cutoffIso})`
    );

  if (error) {
    console.warn("[admin/collection-candidates] count failed", error);
    return 0;
  }
  return count ?? 0;
}

export async function countShortlistedCollectionCandidates(): Promise<number> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    console.warn("[admin/collection-shortlist] count skipped", envCheck.error);
    return 0;
  }

  const { client } = createServiceRoleSupabaseClient();
  const { count, error } = await client
    .from("collection_candidates")
    .select("id", { count: "exact", head: true })
    .eq("status", "shortlisted");

  if (error) {
    console.warn("[admin/collection-shortlist] count failed", error);
    return 0;
  }
  return count ?? 0;
}
