-- Additive: structured per-run exclusion / intake counters for admin UI.
-- Counts + fixed source/feed keys + reason codes only.
-- Never stores titles, URLs, bodies, or external error text.
-- Apply only after explicit ops approval — not applied by this PR.
-- No DEFAULT '{}'. No backfill. Existing rows stay NULL.

ALTER TABLE public.collection_runs
  ADD COLUMN IF NOT EXISTS exclusion_stats jsonb;

COMMENT ON COLUMN public.collection_runs.exclusion_stats IS
  'Optional CollectRunExclusionStats JSON (v2). Null = legacy run (UI: 기록 없음). Counts/codes only — no bodies/URLs/titles. No default; never backfill.';
