-- Additive: structured per-run exclusion / intake counters for admin UI.
-- Counts + reason codes only. Never stores article bodies or RSS payloads.
-- Apply only after explicit ops approval — not applied by this PR.

ALTER TABLE public.collection_runs
  ADD COLUMN IF NOT EXISTS exclusion_stats jsonb;

COMMENT ON COLUMN public.collection_runs.exclusion_stats IS
  'Optional CollectRunExclusionStats JSON (v1). Null = legacy run without detailed counters (UI shows 기록 없음). Counts/reason codes only — no bodies.';

-- No backfill. Existing rows stay NULL.
