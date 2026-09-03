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

-- Conservative starter rules requested by the newsroom. These are editable
-- and can be disabled in Admin > collection rules. Important-event exception
-- signals are evaluated by the application before an exclusion is accepted.
INSERT INTO public.editorial_collection_rules
  (name, action, keywords, content_description, priority, is_active)
SELECT
  '운세·점성술 제외',
  'exclude',
  ARRAY['오늘의 운세', '오늘 운세', '띠별 운세', '별자리 운세', 'daily horoscope', 'horoscope', 'zodiac forecast'],
  '정책·사회적 파급력이 없는 일일 운세와 점성술 콘텐츠',
  90,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.editorial_collection_rules WHERE name = '운세·점성술 제외'
);

INSERT INTO public.editorial_collection_rules
  (name, action, keywords, content_description, priority, is_active)
SELECT
  '좋은 글·명언 제외',
  'exclude',
  ARRAY['오늘의 명언', '좋은 글', '하루 한마디', 'quote of the day', 'daily inspiration', 'inspirational quote'],
  '보도 가치가 없는 일일 명언·격려 문구 콘텐츠',
  85,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.editorial_collection_rules WHERE name = '좋은 글·명언 제외'
);

INSERT INTO public.editorial_collection_rules
  (name, action, keywords, content_description, priority, is_active)
SELECT
  '생활형 지역 행사 제외',
  'exclude',
  ARRAY['지역 행사 안내', '주말 가볼만한 곳', 'community calendar', 'things to do this weekend', 'local festival'],
  '국가적·국제적 영향이 없는 생활형 지역 행사·주말 안내',
  80,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.editorial_collection_rules WHERE name = '생활형 지역 행사 제외'
);

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
