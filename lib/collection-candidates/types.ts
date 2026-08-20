/** collection_candidates.status */
export type CollectionCandidateStatus =
  | "pending"
  | "selected"
  | "enriching"
  | "enriched"
  | "enrich_failed"
  | "dismissed"
  | "expired";

export type CollectionCandidateRow = {
  id: string;
  source: string;
  source_country: string;
  feed_label: string | null;
  original_url: string;
  rss_title: string;
  rss_summary: string | null;
  rss_title_ko: string | null;
  rss_summary_ko: string | null;
  rss_published_at: string | null;
  rss_guid: string | null;
  custom_unique_id: string | null;
  status: CollectionCandidateStatus;
  selected_at: string | null;
  selected_by: string | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
  dismiss_reason: string | null;
  enrich_started_at: string | null;
  enrich_completed_at: string | null;
  enrich_step: string | null;
  enrich_error: string | null;
  enrich_category: string | null;
  enrich_attempt_count: number;
  article_id: string | null;
  collection_run_id: string | null;
  created_at: string;
  updated_at: string;
};

export const COLLECTION_CANDIDATE_LIST_SELECT = `
  id,
  source,
  source_country,
  feed_label,
  original_url,
  rss_title,
  rss_summary,
  rss_title_ko,
  rss_summary_ko,
  rss_published_at,
  status,
  enrich_step,
  enrich_error,
  enrich_category,
  enrich_attempt_count,
  article_id,
  created_at,
  updated_at
`;

export const CANDIDATE_STATUS_LABELS: Record<CollectionCandidateStatus, string> =
  {
    pending: "수집 대기",
    selected: "선택됨",
    enriching: "기사 만드는 중",
    enriched: "검토 대기 저장됨",
    enrich_failed: "기사 만들기 실패",
    dismissed: "제외됨",
    expired: "만료",
  };
