-- Korean preview fields for RSS collection candidates (admin localize button).
-- Does not change existing rows except adding nullable columns.
-- Safe to run multiple times.

ALTER TABLE public.collection_candidates
  ADD COLUMN IF NOT EXISTS rss_title_ko text;

ALTER TABLE public.collection_candidates
  ADD COLUMN IF NOT EXISTS rss_summary_ko text;
