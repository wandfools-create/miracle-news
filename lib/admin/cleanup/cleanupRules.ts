/** Soft-cleanup retention for unused collection candidates / review-queue drafts. */
export const CLEANUP_RETENTION_DAYS = 60;

export const EXPIREABLE_CANDIDATE_STATUSES = [
  "pending",
  "enrich_failed",
  "dismissed",
] as const;

export type ExpireableCandidateStatus =
  (typeof EXPIREABLE_CANDIDATE_STATUSES)[number];

/** Review-queue only — never approved / hold / revision / published / rejected. */
export const ARCHIVEABLE_ARTICLE_STATUS = "ready_for_human_review" as const;
export const ARCHIVEABLE_REVIEW_STATUS = "pending" as const;

export function cleanupCutoffIso(
  now = new Date(),
  retentionDays = CLEANUP_RETENTION_DAYS
): string {
  const ms = retentionDays * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - ms).toISOString();
}

/**
 * Candidate age reference: earlier of rss_published_at / created_at when both exist.
 * Matches “created_at 또는 rss_published_at 기준”.
 */
export function candidateAgeReferenceIso(row: {
  created_at: string;
  rss_published_at?: string | null;
}): string {
  const created = row.created_at;
  const published = row.rss_published_at?.trim() || null;
  if (!published) return created;
  return published < created ? published : created;
}

/** Article age: collected_at, else created_at. */
export function articleAgeReferenceIso(row: {
  created_at: string;
  collected_at?: string | null;
}): string {
  const collected = row.collected_at?.trim() || null;
  return collected || row.created_at;
}

/** Rejected age: updated_at preferred, else collected_at / created_at. */
export function rejectedAgeReferenceIso(row: {
  created_at: string;
  collected_at?: string | null;
  updated_at?: string | null;
}): string {
  const updated = row.updated_at?.trim() || null;
  if (updated) return updated;
  return articleAgeReferenceIso(row);
}

export function isOlderThanCutoff(
  referenceIso: string,
  cutoffIso: string
): boolean {
  return referenceIso < cutoffIso;
}

export function isExpireableCollectionCandidate(
  row: {
    status: string;
    article_id?: string | null;
    created_at: string;
    rss_published_at?: string | null;
  },
  cutoffIso: string
): boolean {
  if (row.article_id) return false;
  if (
    !EXPIREABLE_CANDIDATE_STATUSES.includes(
      row.status as ExpireableCandidateStatus
    )
  ) {
    return false;
  }
  return isOlderThanCutoff(candidateAgeReferenceIso(row), cutoffIso);
}

export function isArchiveableReviewArticle(
  row: {
    status: string;
    review_status: string | null;
    is_published: boolean | null;
    is_top_story?: boolean | null;
    created_at: string;
    collected_at?: string | null;
  },
  cutoffIso: string
): boolean {
  if (row.is_published === true) return false;
  if (row.is_top_story === true) return false;
  if (row.status !== ARCHIVEABLE_ARTICLE_STATUS) return false;
  if (row.review_status !== ARCHIVEABLE_REVIEW_STATUS) return false;
  // Explicitly exclude protected queues even if status were wrong.
  const protectedReview = new Set([
    "approved",
    "on_hold",
    "needs_revision",
    "rejected",
    "archived",
  ]);
  if (row.review_status && protectedReview.has(row.review_status)) return false;
  const protectedStatus = new Set([
    "approved",
    "published",
    "needs_revision",
    "rejected",
    "archived",
  ]);
  if (protectedStatus.has(row.status)) return false;
  return isOlderThanCutoff(articleAgeReferenceIso(row), cutoffIso);
}

/**
 * Rejected drafts older than retention → soft-archive.
 * Never touches hold / revision / approved / published / top story.
 */
export function isArchiveableRejectedArticle(
  row: {
    status: string;
    review_status: string | null;
    is_published: boolean | null;
    is_top_story?: boolean | null;
    created_at: string;
    collected_at?: string | null;
    updated_at?: string | null;
  },
  cutoffIso: string
): boolean {
  if (row.is_published === true) return false;
  if (row.is_top_story === true) return false;
  if (row.status !== "rejected") return false;
  if (row.review_status !== "rejected") return false;
  return isOlderThanCutoff(rejectedAgeReferenceIso(row), cutoffIso);
}
