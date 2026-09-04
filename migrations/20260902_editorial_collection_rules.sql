-- Admin-managed low-cost collection rules and minimal exclusion audit.
-- Additive only. Apply manually after review; this PR does not apply it.

CREATE TABLE IF NOT EXISTS public.editorial_collection_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  action text NOT NULL CHECK (action IN ('prioritize', 'review', 'exclude')),
  keywords text[] NOT NULL DEFAULT '{}',
  content_description text,
  source_key text,
  priority integer NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  is_active boolean NOT NULL DEFAULT true,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS editorial_collection_rules_active_priority_idx
  ON public.editorial_collection_rules (is_active, priority DESC);

CREATE TABLE IF NOT EXISTS public.editorial_collection_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.editorial_collection_rules(id) ON DELETE SET NULL,
  source text NOT NULL,
  original_url text NOT NULL,
  title_excerpt text NOT NULL CHECK (char_length(title_excerpt) <= 300),
  decision text NOT NULL CHECK (decision IN ('excluded')),
  reason text NOT NULL,
  collection_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS editorial_collection_audit_created_idx
  ON public.editorial_collection_audit (created_at DESC);

ALTER TABLE public.editorial_collection_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_collection_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS editorial_collection_rules_service_role_all ON public.editorial_collection_rules;
CREATE POLICY editorial_collection_rules_service_role_all
  ON public.editorial_collection_rules FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS editorial_collection_audit_service_role_all ON public.editorial_collection_audit;
CREATE POLICY editorial_collection_audit_service_role_all
  ON public.editorial_collection_audit FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.editorial_collection_rules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.editorial_collection_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.editorial_collection_rules TO service_role;
GRANT ALL ON public.editorial_collection_audit TO service_role;

COMMENT ON TABLE public.editorial_collection_audit IS
  'Admin-only minimal audit of rule exclusions; no article body or RSS summary stored. Review retention after 90 days manually.';

CREATE OR REPLACE FUNCTION public.cleanup_editorial_collection_audit(p_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer;
BEGIN
  IF p_days < 30 THEN
    RAISE EXCEPTION 'retention must be at least 30 days';
  END IF;
  DELETE FROM public.editorial_collection_audit
  WHERE created_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_editorial_collection_audit(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_editorial_collection_audit(integer)
  TO service_role;
