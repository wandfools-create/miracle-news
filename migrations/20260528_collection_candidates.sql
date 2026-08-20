-- RSS collection candidates (phase 1): ingest metadata before admin enrich.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.collection_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  source text NOT NULL,
  source_country text NOT NULL DEFAULT 'US',
  feed_label text,

  original_url text NOT NULL,
  rss_title text NOT NULL,
  rss_summary text,
  rss_title_ko text,
  rss_summary_ko text,
  rss_published_at timestamptz,
  rss_guid text,
  custom_unique_id text,

  status text NOT NULL DEFAULT 'pending',
  selected_at timestamptz,
  selected_by text,
  dismissed_at timestamptz,
  dismissed_by text,
  dismiss_reason text,

  enrich_started_at timestamptz,
  enrich_completed_at timestamptz,
  enrich_step text,
  enrich_error text,
  enrich_category text,
  enrich_attempt_count integer NOT NULL DEFAULT 0,
  article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,

  collection_run_id uuid,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS collection_candidates_source_url_uq
  ON public.collection_candidates (source, original_url);

CREATE UNIQUE INDEX IF NOT EXISTS collection_candidates_custom_unique_id_uq
  ON public.collection_candidates (custom_unique_id)
  WHERE custom_unique_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS collection_candidates_status_created_idx
  ON public.collection_candidates (status, created_at DESC);

CREATE INDEX IF NOT EXISTS collection_candidates_original_url_idx
  ON public.collection_candidates (original_url);

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_collection_candidates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collection_candidates_updated_at ON public.collection_candidates;

CREATE TRIGGER collection_candidates_updated_at
  BEFORE UPDATE ON public.collection_candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_collection_candidates_updated_at();

ALTER TABLE public.collection_candidates ENABLE ROW LEVEL SECURITY;

-- Admin-only: no anon/authenticated SELECT. App reads via service_role on the server.
DROP POLICY IF EXISTS collection_candidates_read ON public.collection_candidates;
DROP POLICY IF EXISTS collection_candidates_service_role_all ON public.collection_candidates;

CREATE POLICY collection_candidates_service_role_all
  ON public.collection_candidates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
