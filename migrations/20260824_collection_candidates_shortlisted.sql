-- Editorial shortlist status for collection_candidates.
-- status is free-form text; this documents the new value only.

COMMENT ON COLUMN public.collection_candidates.status IS
  'pending | shortlisted | selected | enriching | enriched | enrich_failed | dismissed | expired';

CREATE INDEX IF NOT EXISTS collection_candidates_shortlisted_idx
  ON public.collection_candidates (status, created_at DESC)
  WHERE status = 'shortlisted';
