-- Collection runs registry for regional RSS desk collects.
-- Additive only. Apply only after explicit ops approval — not applied by this PR.
-- Pre-migration: app fail-opens (skips run create/link/finish; collect continues).

CREATE TABLE IF NOT EXISTS public.collection_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region text NOT NULL,
  trigger_type text NOT NULL DEFAULT 'unknown',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  collected_count integer NOT NULL DEFAULT 0,
  new_candidate_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collection_runs_region_check
    CHECK (region IN ('korea', 'us-intl')),
  CONSTRAINT collection_runs_status_check
    CHECK (status IN ('running', 'success', 'partial', 'failed')),
  CONSTRAINT collection_runs_trigger_check
    CHECK (trigger_type IN ('vercel_cron', 'github_actions', 'manual', 'unknown'))
);

CREATE INDEX IF NOT EXISTS collection_runs_started_at_idx
  ON public.collection_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS collection_runs_region_started_idx
  ON public.collection_runs (region, started_at DESC);

CREATE INDEX IF NOT EXISTS collection_runs_status_started_idx
  ON public.collection_runs (status, started_at DESC);

-- collection_candidates.collection_run_id already exists (nullable). Add FK + index.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collection_candidates_collection_run_id_fkey'
  ) THEN
    ALTER TABLE public.collection_candidates
      ADD CONSTRAINT collection_candidates_collection_run_id_fkey
      FOREIGN KEY (collection_run_id)
      REFERENCES public.collection_runs(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS collection_candidates_collection_run_id_idx
  ON public.collection_candidates (collection_run_id)
  WHERE collection_run_id IS NOT NULL;

COMMENT ON TABLE public.collection_runs IS
  'One row per regional RSS collect execution. Candidates link via collection_run_id. No auto-publish.';

COMMENT ON COLUMN public.collection_runs.error_summary IS
  'Sanitized short error text only — never secrets, tokens, or full article bodies.';

ALTER TABLE public.collection_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS collection_runs_service_role_all ON public.collection_runs;

CREATE POLICY collection_runs_service_role_all
  ON public.collection_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Explicitly deny direct browser roles (no SELECT/INSERT for anon/authenticated).
REVOKE ALL ON TABLE public.collection_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.collection_runs FROM anon;
REVOKE ALL ON TABLE public.collection_runs FROM authenticated;
GRANT ALL ON TABLE public.collection_runs TO service_role;
