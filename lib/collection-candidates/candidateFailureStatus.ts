import type { CollectionCandidateStatus } from "./types";

/**
 * A failed enrich must stay in the queue where the editor started it.
 * Shortlisted candidates remain in the editorial shortlist; other candidates
 * use the shared failure queue so they can be retried from collection candidates.
 */
export function candidateStatusAfterEnrichFailure(
  originalStatus: CollectionCandidateStatus
): "shortlisted" | "enrich_failed" {
  return originalStatus === "shortlisted" ? "shortlisted" : "enrich_failed";
}
