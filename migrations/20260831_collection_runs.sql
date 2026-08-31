-- Collection run registry for 4x-daily RSS desk runs (apply in Supabase SQL editor).

CREATE TABLE IF NOT EXISTS public.collection_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  region text,
  status text NOT NULL DEFAULT 'running',
  checked_count integer NOT NULL DEFAULT 0,
  saved_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS collection_runs_started_at_idx
  ON public.collection_runs (started_at DESC);

COMMENT ON TABLE public.collection_runs IS
  'RSS/candidate collection run metadata. Candidates link via collection_run_id.';
