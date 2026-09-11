-- Public News Wire support columns (additive only).
-- Do NOT apply in this PR session. Idempotent / IF NOT EXISTS.
-- Does not UPDATE/DELETE/TRUNCATE existing candidate rows.
-- Does not loosen RLS on collection_candidates.

ALTER TABLE public.collection_candidates
  ADD COLUMN IF NOT EXISTS rss_title_en text;

ALTER TABLE public.collection_candidates
  ADD COLUMN IF NOT EXISTS wire_titles_ready_at timestamptz;

COMMENT ON COLUMN public.collection_candidates.rss_title_en IS
  'English headline for public News Wire (title only; no body).';
COMMENT ON COLUMN public.collection_candidates.wire_titles_ready_at IS
  'Set when both KO and EN wire titles are ready for public display.';

-- Lean public wire listing: active statuses, newest first.
CREATE INDEX IF NOT EXISTS collection_candidates_wire_active_created_idx
  ON public.collection_candidates (created_at DESC)
  WHERE status IN ('pending', 'shortlisted', 'enriching', 'enrich_failed');

-- Pending title localization backlog (wire_titles_ready_at null).
CREATE INDEX IF NOT EXISTS collection_candidates_wire_titles_pending_idx
  ON public.collection_candidates (created_at DESC)
  WHERE status IN ('pending', 'shortlisted', 'enriching', 'enrich_failed')
    AND wire_titles_ready_at IS NULL;
