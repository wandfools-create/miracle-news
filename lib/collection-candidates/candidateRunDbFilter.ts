/**
 * Pure helpers that translate run UI filters into PostgREST-style chain calls.
 * No server-only — used by fetch + unit tests.
 */

import type { CollectionRunDbFilter } from "@/lib/collection-candidates/groupCandidatesByRun";
import { sourceKeysForRunRegionFilter } from "@/lib/collection-candidates/groupCandidatesByRun";

export type ChainableCandidateQuery = {
  eq: (col: string, val: unknown) => ChainableCandidateQuery;
  in: (col: string, val: readonly string[]) => ChainableCandidateQuery;
  is: (col: string, val: null) => ChainableCandidateQuery;
  gte: (col: string, val: string) => ChainableCandidateQuery;
  lt: (col: string, val: string) => ChainableCandidateQuery;
};

export function applyCollectionRunDbFilter<T extends ChainableCandidateQuery>(
  dbQuery: T,
  filter: CollectionRunDbFilter
): T {
  if (filter.kind === "real") {
    return dbQuery.eq("collection_run_id", filter.runId) as T;
  }
  let q: ChainableCandidateQuery = dbQuery
    .is("collection_run_id", null)
    .gte("created_at", filter.startedAt)
    .lt("created_at", filter.endedAt);
  const keys = sourceKeysForRunRegionFilter(filter.region);
  if (keys?.length) {
    q = q.in("source", keys);
  }
  return q as T;
}

/** Record query chain calls for unit tests. */
export function createQueryCallRecorder() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const api: ChainableCandidateQuery = {
    eq(col, val) {
      calls.push({ method: "eq", args: [col, val] });
      return api;
    },
    in(col, val) {
      calls.push({ method: "in", args: [col, val] });
      return api;
    },
    is(col, val) {
      calls.push({ method: "is", args: [col, val] });
      return api;
    },
    gte(col, val) {
      calls.push({ method: "gte", args: [col, val] });
      return api;
    },
    lt(col, val) {
      calls.push({ method: "lt", args: [col, val] });
      return api;
    },
  };
  return { api, calls };
}
