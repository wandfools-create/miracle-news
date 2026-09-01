-- Privacy-conscious analytics events (apply manually in Supabase SQL editor).
-- Additive only. Rollback SQL is documented in PR #31 body.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  session_id text NOT NULL,
  locale text,
  path text,
  article_id uuid,
  source_key text,
  category_key text,
  search_query text,
  referrer_domain text,
  device_class text,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_events_device_class_chk
    CHECK (device_class IS NULL OR device_class IN ('mobile', 'desktop')),
  CONSTRAINT analytics_events_event_name_chk
    CHECK (event_name IN (
      'page_view',
      'article_view',
      'article_click',
      'source_filter_click',
      'category_filter_click',
      'related_article_click',
      'language_switch',
      'search_submit',
      'search_result_click'
    )),
  CONSTRAINT analytics_events_locale_chk
    CHECK (locale IS NULL OR locale IN ('ko', 'en')),
  CONSTRAINT analytics_events_session_id_len_chk
    CHECK (char_length(session_id) <= 64),
  CONSTRAINT analytics_events_path_len_chk
    CHECK (path IS NULL OR char_length(path) <= 500),
  CONSTRAINT analytics_events_source_key_len_chk
    CHECK (source_key IS NULL OR char_length(source_key) <= 80),
  CONSTRAINT analytics_events_category_key_len_chk
    CHECK (category_key IS NULL OR char_length(category_key) <= 80),
  CONSTRAINT analytics_events_search_query_len_chk
    CHECK (search_query IS NULL OR char_length(search_query) <= 80),
  CONSTRAINT analytics_events_referrer_domain_len_chk
    CHECK (referrer_domain IS NULL OR char_length(referrer_domain) <= 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_dedupe_key_uq
  ON public.analytics_events (dedupe_key);

CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx
  ON public.analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_name_created_idx
  ON public.analytics_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_session_created_idx
  ON public.analytics_events (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_locale_created_idx
  ON public.analytics_events (locale, created_at DESC)
  WHERE locale IS NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_events_article_created_idx
  ON public.analytics_events (article_id, created_at DESC)
  WHERE article_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_events_search_query_idx
  ON public.analytics_events (search_query, created_at DESC)
  WHERE search_query IS NOT NULL AND event_name = 'search_submit';

COMMENT ON TABLE public.analytics_events IS
  'Anonymous newsroom analytics. No IP, user-agent, or arbitrary metadata.';

COMMENT ON COLUMN public.analytics_events.search_query IS
  'Normalized search text (max 80 chars, PII masked). Anonymized after retention via ops cleanup.';

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.analytics_events FROM PUBLIC;
REVOKE ALL ON TABLE public.analytics_events FROM anon;
REVOKE ALL ON TABLE public.analytics_events FROM authenticated;
GRANT ALL ON TABLE public.analytics_events TO service_role;

DROP POLICY IF EXISTS analytics_events_service_role_all ON public.analytics_events;
CREATE POLICY analytics_events_service_role_all
  ON public.analytics_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.analytics_admin_summary(p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz;
BEGIN
  IF p_days NOT IN (1, 7, 30) THEN
    RAISE EXCEPTION 'invalid_days';
  END IF;

  v_since := now() - make_interval(days => p_days);

  RETURN jsonb_build_object(
    'page_views',
      (SELECT count(*)::bigint FROM analytics_events
       WHERE created_at >= v_since AND event_name = 'page_view'),
    'sessions',
      (SELECT count(DISTINCT session_id)::bigint FROM analytics_events
       WHERE created_at >= v_since),
    'article_views',
      (SELECT count(*)::bigint FROM analytics_events
       WHERE created_at >= v_since AND event_name = 'article_view'),
    'article_clicks',
      (SELECT count(*)::bigint FROM analytics_events
       WHERE created_at >= v_since
         AND event_name IN ('article_click', 'related_article_click', 'search_result_click')),
    'home_article_clicks',
      (SELECT count(*)::bigint FROM analytics_events
       WHERE created_at >= v_since AND event_name = 'article_click'),
    'related_article_clicks',
      (SELECT count(*)::bigint FROM analytics_events
       WHERE created_at >= v_since AND event_name = 'related_article_click'),
    'search_result_clicks',
      (SELECT count(*)::bigint FROM analytics_events
       WHERE created_at >= v_since AND event_name = 'search_result_click'),
    'search_submits',
      (SELECT count(*)::bigint FROM analytics_events
       WHERE created_at >= v_since AND event_name = 'search_submit'),
    'source_filter_clicks',
      (SELECT count(*)::bigint FROM analytics_events
       WHERE created_at >= v_since AND event_name = 'source_filter_click'),
    'category_filter_clicks',
      (SELECT count(*)::bigint FROM analytics_events
       WHERE created_at >= v_since AND event_name = 'category_filter_click'),
    'language_switches',
      (SELECT count(*)::bigint FROM analytics_events
       WHERE created_at >= v_since AND event_name = 'language_switch'),
    'ko_events',
      (SELECT count(*)::bigint FROM analytics_events
       WHERE created_at >= v_since AND locale = 'ko'),
    'en_events',
      (SELECT count(*)::bigint FROM analytics_events
       WHERE created_at >= v_since AND locale = 'en'),
    'mobile_events',
      (SELECT count(*)::bigint FROM analytics_events
       WHERE created_at >= v_since AND device_class = 'mobile'),
    'desktop_events',
      (SELECT count(*)::bigint FROM analytics_events
       WHERE created_at >= v_since AND device_class = 'desktop'),
    'top_viewed_articles',
      COALESCE((
        SELECT jsonb_agg(row_to_json(t) ORDER BY t.count DESC)
        FROM (
          SELECT article_id::text AS article_id, count(*)::int AS count
          FROM analytics_events
          WHERE created_at >= v_since
            AND event_name = 'article_view'
            AND article_id IS NOT NULL
          GROUP BY article_id
          ORDER BY count DESC
          LIMIT 15
        ) t
      ), '[]'::jsonb),
    'top_clicked_articles',
      COALESCE((
        SELECT jsonb_agg(row_to_json(t) ORDER BY t.count DESC)
        FROM (
          SELECT article_id::text AS article_id, count(*)::int AS count
          FROM analytics_events
          WHERE created_at >= v_since
            AND event_name IN ('article_click', 'related_article_click', 'search_result_click')
            AND article_id IS NOT NULL
          GROUP BY article_id
          ORDER BY count DESC
          LIMIT 15
        ) t
      ), '[]'::jsonb),
    'top_sources',
      COALESCE((
        SELECT jsonb_agg(row_to_json(t) ORDER BY t.count DESC)
        FROM (
          SELECT source_key AS source_key, count(*)::int AS count
          FROM analytics_events
          WHERE created_at >= v_since
            AND event_name = 'source_filter_click'
            AND source_key IS NOT NULL
          GROUP BY source_key
          ORDER BY count DESC
          LIMIT 12
        ) t
      ), '[]'::jsonb),
    'top_categories',
      COALESCE((
        SELECT jsonb_agg(row_to_json(t) ORDER BY t.count DESC)
        FROM (
          SELECT category_key AS category_key, count(*)::int AS count
          FROM analytics_events
          WHERE created_at >= v_since
            AND event_name = 'category_filter_click'
            AND category_key IS NOT NULL
          GROUP BY category_key
          ORDER BY count DESC
          LIMIT 12
        ) t
      ), '[]'::jsonb),
    'top_search_queries',
      COALESCE((
        SELECT jsonb_agg(row_to_json(t) ORDER BY t.count DESC)
        FROM (
          SELECT search_query AS query, count(*)::int AS count
          FROM analytics_events
          WHERE created_at >= v_since
            AND event_name = 'search_submit'
            AND search_query IS NOT NULL
          GROUP BY search_query
          ORDER BY count DESC
          LIMIT 20
        ) t
      ), '[]'::jsonb),
    'top_referrers',
      COALESCE((
        SELECT jsonb_agg(row_to_json(t) ORDER BY t.count DESC)
        FROM (
          SELECT referrer_domain AS domain, count(DISTINCT session_id)::int AS count
          FROM analytics_events
          WHERE created_at >= v_since
            AND referrer_domain IS NOT NULL
            AND event_name IN ('page_view', 'article_view')
          GROUP BY referrer_domain
          ORDER BY count DESC
          LIMIT 12
        ) t
      ), '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.analytics_admin_summary(integer) IS
  'Aggregated analytics for admin dashboard. service_role only.';

REVOKE ALL ON FUNCTION public.analytics_admin_summary(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.analytics_admin_summary(integer) FROM anon;
REVOKE ALL ON FUNCTION public.analytics_admin_summary(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_admin_summary(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.anonymize_analytics_search_queries(
  p_retention_days integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anonymized integer;
BEGIN
  IF p_retention_days < 1 OR p_retention_days > 365 THEN
    RAISE EXCEPTION 'invalid_retention_days';
  END IF;

  UPDATE analytics_events
  SET search_query = NULL
  WHERE event_name = 'search_submit'
    AND search_query IS NOT NULL
    AND created_at < now() - make_interval(days => p_retention_days);

  GET DIAGNOSTICS v_anonymized = ROW_COUNT;
  RETURN v_anonymized;
END;
$$;

COMMENT ON FUNCTION public.anonymize_analytics_search_queries(integer) IS
  'Null out stored search_query text older than retention window. Event rows and counts remain; run manually via ops.';

REVOKE ALL ON FUNCTION public.anonymize_analytics_search_queries(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anonymize_analytics_search_queries(integer) FROM anon;
REVOKE ALL ON FUNCTION public.anonymize_analytics_search_queries(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_analytics_search_queries(integer) TO service_role;
