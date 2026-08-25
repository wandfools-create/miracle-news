-- RSS candidate thumbnail + desk category (no backfill).
-- Apply in Supabase SQL editor before relying on thumbnail_url / category in collect.

ALTER TABLE public.collection_candidates
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

ALTER TABLE public.collection_candidates
  ADD COLUMN IF NOT EXISTS category text;

COMMENT ON COLUMN public.collection_candidates.thumbnail_url IS
  'Optional image from RSS media/enclosure at collect time; null if absent';

COMMENT ON COLUMN public.collection_candidates.category IS
  'Desk category hint from feed (politics/economy/society/world/...); null when unknown';
