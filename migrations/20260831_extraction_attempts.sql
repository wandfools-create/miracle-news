-- Extraction attempt audit (apply in Supabase SQL editor). No full body or secrets.

CREATE TABLE IF NOT EXISTS public.extraction_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  source text,
  failure_code text NOT NULL,
  http_status integer,
  extracted_length integer,
  extraction_method text,
  attempt_count integer NOT NULL DEFAULT 1,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  collection_run_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS extraction_attempts_last_attempt_idx
  ON public.extraction_attempts (last_attempt_at DESC);

CREATE INDEX IF NOT EXISTS extraction_attempts_source_idx
  ON public.extraction_attempts (source, last_attempt_at DESC);

COMMENT ON TABLE public.extraction_attempts IS
  'Body extraction failures for admin triage — no paywall bypass data.';
