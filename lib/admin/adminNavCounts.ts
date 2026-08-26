import "server-only";

import { unstable_cache } from "next/cache";
import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";
import { supabase } from "@/lib/supabase";
import {
  checkSupabaseServiceEnvWithDnsCached,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";
import { candidateFreshnessCutoffIso } from "@/lib/collection-candidates/candidateRecommend";

const ACTIONABLE_STATUSES = ["pending", "enrich_failed", "enriching"] as const;

export type AdminNavCounts = {
  review: number;
  quickReview: number;
  onHold: number;
  revision: number;
  approved: number;
  published: number;
  rejected: number;
  collectionCandidates: number;
  collectionShortlist: number;
};

export const ADMIN_NAV_COUNTS_TAG = "admin-nav-counts";
/** Badge counts may be stale up to this many seconds (acceptable for nav). */
export const ADMIN_NAV_COUNTS_TTL_SEC = 45;

async function fetchCandidateNavCounts(): Promise<{
  collectionCandidates: number;
  collectionShortlist: number;
}> {
  const envCheck = await checkSupabaseServiceEnvWithDnsCached();
  if (!envCheck.ok) {
    return { collectionCandidates: 0, collectionShortlist: 0 };
  }

  const { client } = createServiceRoleSupabaseClient();
  const cutoffIso = candidateFreshnessCutoffIso();

  const [actionable, shortlist] = await Promise.all([
    client
      .from("collection_candidates")
      .select("id", { count: "exact", head: true })
      .in("status", [...ACTIONABLE_STATUSES])
      .or(
        `rss_published_at.gte.${cutoffIso},and(rss_published_at.is.null,created_at.gte.${cutoffIso})`
      ),
    client
      .from("collection_candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "shortlisted"),
  ]);

  return {
    collectionCandidates: actionable.count ?? 0,
    collectionShortlist: shortlist.count ?? 0,
  };
}

/** Uncached fetch — used only inside unstable_cache wrapper. */
export async function fetchAdminNavCountsUncached(): Promise<AdminNavCounts> {
  const [
    reviewRes,
    quickReviewRes,
    onHoldRes,
    revisionRes,
    approvedRes,
    publishedRes,
    rejectedRes,
    candidateCounts,
  ] = await Promise.all([
    supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("status", "ready_for_human_review")
      .eq("review_status", "pending"),

    supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("status", ARTICLE_WORKFLOW.quickReview.status)
      .eq("review_status", ARTICLE_WORKFLOW.quickReview.review_status)
      .eq("is_published", false),

    supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("review_status", "on_hold"),

    supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("review_status", "needs_revision")
      .eq("revision_status", "requested"),

    supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("review_status", "approved")
      .eq("status", "approved")
      .eq("is_published", false),

    supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true)
      .eq("status", "published"),

    supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("review_status", "rejected")
      .eq("status", "rejected"),

    fetchCandidateNavCounts(),
  ]);

  return {
    review: reviewRes.count ?? 0,
    quickReview: quickReviewRes.count ?? 0,
    onHold: onHoldRes.count ?? 0,
    revision: revisionRes.count ?? 0,
    approved: approvedRes.count ?? 0,
    published: publishedRes.count ?? 0,
    rejected: rejectedRes.count ?? 0,
    collectionCandidates: candidateCounts.collectionCandidates,
    collectionShortlist: candidateCounts.collectionShortlist,
  };
}

export const getAdminNavCounts = unstable_cache(
  fetchAdminNavCountsUncached,
  [ADMIN_NAV_COUNTS_TAG],
  { revalidate: ADMIN_NAV_COUNTS_TTL_SEC, tags: [ADMIN_NAV_COUNTS_TAG] }
);
