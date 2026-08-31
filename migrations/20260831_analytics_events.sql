-- Privacy-conscious analytics events (apply in Supabase SQL editor).

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  session_id text NOT NULL,
  locale text,
  path text,
  article_id uuid,
  source_key text,
  category_key text,
  search_query_hash text,
  referrer_domain text,
  device_class text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx
  ON public.analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_name_created_idx
  ON public.analytics_events (event_name, created_at DESC);

COMMENT ON TABLE public.analytics_events IS
  'Aggregated newsroom analytics — no raw IP/UA/PII.';
