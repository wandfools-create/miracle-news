import "server-only";

import { candidateFreshnessCutoffIso } from "@/lib/collection-candidates/candidateRecommend";
import { collectRowsByRangePagination } from "@/lib/collection-candidates/candidateFetchPagination";
import {
  parseCollectionRunDbFilter,
} from "@/lib/collection-candidates/groupCandidatesByRun";
import { applyCollectionRunDbFilter } from "@/lib/collection-candidates/candidateRunDbFilter";
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
import type { CollectRegion } from "@/lib/rss/collectRegions";
import { sourceKeysForRunRegionFilter } from "@/lib/collection-candidates/groupCandidatesByRun";
import {
  checkSupabaseServiceEnvWithDnsCached,
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

/** Default workbench page size when no specific run is selected. */
export const COLLECTION_CANDIDATES_DEFAULT_LIMIT = 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

function applyRegionSourceFilter(
  dbQuery: AnyQuery,
  region: CollectRegion | "all"
): AnyQuery {
  const keys = sourceKeysForRunRegionFilter(region);
  if (!keys?.length) return dbQuery;
  return dbQuery.in("source", keys);
}

function applyStatusAndViewFilters(
  dbQuery: AnyQuery,
  input: {
    query: CandidateListQuery;
    statusFilter: FetchCollectionCandidatesResult["statusFilter"];
    cutoffIso: string;
    /** When true, skip freshness window (run already scopes the rows). */
    skipFreshnessWindow: boolean;
  }
): AnyQuery {
  const { query, statusFilter, cutoffIso, skipFreshnessWindow } = input;
  let q = dbQuery;

  if (statusFilter === "shortlisted") {
    return q.eq("status", "shortlisted");
  }
  if (statusFilter === "pending") {
    q = q.eq("status", "pending");
  } else if (statusFilter === "actionable") {
    q = q.in("status", ACTIONABLE_STATUSES);
  } else if (statusFilter !== "all") {
    q = q.eq("status", statusFilter);
  }

  if (skipFreshnessWindow) return q;

  if (query.view === "ai" || query.view === "recent") {
    if (query.view === "recent" && statusFilter === "all") {
      q = q.eq("status", "pending");
    }
    const range = dateFilterRange(query.date);
    const fromIso =
      range && range.from > cutoffIso ? range.from : cutoffIso;
    q = q.or(
      `rss_published_at.gte.${fromIso},and(rss_published_at.is.null,created_at.gte.${fromIso})`
    );
  } else if (query.view === "older") {
    if (statusFilter === "all") {
      q = q.eq("status", "pending");
    }
    q = q.or(
      `rss_published_at.lt.${cutoffIso},and(rss_published_at.is.null,created_at.lt.${cutoffIso})`
    );
  }

  return q;
}

export async function fetchCollectionCandidates(input?: {
  view?: string | null;
  status?: string | null;
  source?: string | null;
  date?: string | null;
  category?: string | null;
  runKey?: string | null;
  runRegion?: CollectRegion | "all" | null;
  pendingOnly?: boolean;
  limit?: number;
}): Promise<FetchCollectionCandidatesResult> {
  const query = parseCandidateListQuery({
    view: input?.view ?? undefined,
    status: input?.status ?? undefined,
    source: input?.source ?? undefined,
    date: input?.date ?? undefined,
    category: input?.category ?? undefined,
  });
  const runFilter = parseCollectionRunDbFilter(input?.runKey);
  const runRegion = input?.runRegion ?? "all";
  const pendingOnly = input?.pendingOnly === true;
  const scopedToRun = Boolean(runFilter);
  const limit = input?.limit ?? COLLECTION_CANDIDATES_DEFAULT_LIMIT;

  let statusFilter: FetchCollectionCandidatesResult["statusFilter"] = "all";
  if (pendingOnly) {
    statusFilter = "pending";
  } else if (query.status === "all") {
    statusFilter = "all";
  } else if (query.status === "actionable") {
    statusFilter = "actionable";
  } else {
    statusFilter = query.status as CollectionCandidateStatus;
  }

  const envCheck = await checkSupabaseServiceEnvWithDnsCached();
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

  const buildQuery = (): AnyQuery => {
    let dbQuery = client
      .from("collection_candidates")
      .select(COLLECTION_CANDIDATE_LIST_SELECT);

    if (runFilter) {
      dbQuery = applyCollectionRunDbFilter(dbQuery as AnyQuery, runFilter);
    } else if (runRegion !== "all") {
      dbQuery = applyRegionSourceFilter(dbQuery, runRegion);
    }

    dbQuery = applyStatusAndViewFilters(dbQuery, {
      query,
      statusFilter,
      cutoffIso,
      skipFreshnessWindow: scopedToRun,
    });

    if (query.source !== "all") {
      dbQuery = dbQuery.eq("source", query.source);
    }

    return dbQuery
      .order("rss_published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
  };

  if (scopedToRun) {
    const paged = await collectRowsByRangePagination<CollectionCandidateRow>(
      async (from, to) => {
        const { data, error } = await buildQuery().range(from, to);
        if (error) return { ok: false, error: error.message };
        return { ok: true, rows: (data ?? []) as CollectionCandidateRow[] };
      }
    );
    if (!paged.ok) {
      console.error(
        "[admin/collection-candidates] run-scoped fetch failed",
        paged.error
      );
      return {
        candidates: [],
        error: { message: paged.error },
        statusFilter,
        query,
      };
    }
    return {
      candidates: paged.rows,
      error: null,
      statusFilter,
      query,
    };
  }

  const { data, error } = await buildQuery().limit(limit);

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
  const envCheck = await checkSupabaseServiceEnvWithDnsCached();
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
  const envCheck = await checkSupabaseServiceEnvWithDnsCached();
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
