-- Editorial collection controls v2 (admin free rules before AI).
-- Additive only. Do NOT apply in this PR — write-only migration.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.editorial_collection_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  kind text NOT NULL DEFAULT 'keyword'
    CHECK (kind IN ('keyword', 'category', 'source')),
  action text NOT NULL
    CHECK (action IN ('always_keep', 'prioritize', 'review', 'exclude')),
  keywords text[] NOT NULL DEFAULT '{}',
  category text,
  source_key text,
  region text NOT NULL DEFAULT 'all'
    CHECK (region IN ('all', 'us-intl', 'korea')),
  priority integer NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  is_active boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  admin_note text,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT editorial_collection_rules_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS editorial_collection_rules_active_priority_idx
  ON public.editorial_collection_rules (is_active, priority DESC);

CREATE INDEX IF NOT EXISTS editorial_collection_rules_source_idx
  ON public.editorial_collection_rules (source_key)
  WHERE source_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.editorial_collection_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.editorial_collection_rules(id) ON DELETE SET NULL,
  rule_name text,
  source text NOT NULL,
  region text,
  original_url text NOT NULL,
  title_excerpt text NOT NULL CHECK (char_length(title_excerpt) <= 300),
  decision text NOT NULL CHECK (decision IN ('excluded')),
  reason text NOT NULL,
  collection_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS editorial_collection_audit_created_idx
  ON public.editorial_collection_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS editorial_collection_audit_source_idx
  ON public.editorial_collection_audit (source, created_at DESC);

ALTER TABLE public.editorial_collection_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_collection_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS editorial_collection_rules_service_role_all
  ON public.editorial_collection_rules;
CREATE POLICY editorial_collection_rules_service_role_all
  ON public.editorial_collection_rules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS editorial_collection_audit_service_role_all
  ON public.editorial_collection_audit;
CREATE POLICY editorial_collection_audit_service_role_all
  ON public.editorial_collection_audit
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.editorial_collection_rules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.editorial_collection_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.editorial_collection_rules TO service_role;
GRANT ALL ON public.editorial_collection_audit TO service_role;

COMMENT ON TABLE public.editorial_collection_rules IS
  'Admin-managed free collection rules (keyword/category/source). New user rules default inactive.';
COMMENT ON TABLE public.editorial_collection_audit IS
  'Minimal auto-exclude audit: URL, short title, source, region, rule — no body/summary/PII.';

-- 90-day cleanup helper only (no cron / no schedule in this migration).
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

-- System seed rules (fixed UUIDs). Active by default; deactivate instead of delete.
INSERT INTO public.editorial_collection_rules (
  id, name, kind, action, keywords, category, source_key, region,
  priority, is_active, is_system, admin_note, created_by, updated_by
) VALUES
(
  'a1000001-0001-4000-8000-000000000001',
  '기본 우선: 공중보건·감염병',
  'keyword',
  'prioritize',
  ARRAY[
    '코로나','신종 감염병','신종 바이러스','변이 바이러스','집단감염','확진자 급증',
    '감염 확산','입원 증가','사망자 증가','공중보건 비상사태','보건당국','CDC','WHO',
    'COVID','coronavirus','outbreak','epidemic','pandemic','new variant','cases surge',
    'hospitalization','public health emergency','respiratory virus','infectious disease'
  ]::text[],
  NULL, NULL, 'all', 90, true, true,
  '시스템 seed — 감염병·공중보건 우선 검토',
  'system', 'system'
),
(
  'a1000001-0001-4000-8000-000000000002',
  '기본 우선: 정치·안보·경제',
  'keyword',
  'prioritize',
  ARRAY[
    'diplomacy','diplomatic','sanctions','national security','terrorism','missile','nuclear',
    'election','congress','supreme court','tariff','trade war','central bank','federal reserve',
    '외교','제재','국가 안보','테러','미사일','핵','선거','국회','대법원','관세','무역전쟁','중앙은행'
  ]::text[],
  NULL, NULL, 'all', 85, true, true,
  '시스템 seed — 외교·안보·중앙정부·무역',
  'system', 'system'
),
(
  'a1000001-0001-4000-8000-000000000010',
  '기본 제외: ScienceDaily 출처',
  'source',
  'exclude',
  '{}'::text[],
  NULL, 'sciencedaily', 'us-intl', 70, true, true,
  '시스템 seed — 출처 key sciencedaily (피드 삭제가 아님)',
  'system', 'system'
),
(
  'a1000001-0001-4000-8000-000000000011',
  '기본 제외: 가벼운·생활·홍보',
  'keyword',
  'exclude',
  ARRAY[
    'horoscope','astrology','tarot','recipe','fashion tip','beauty tip','parenting tip',
    'wellness tip','celebrity dating','box score','fantasy football','community calendar',
    'local events','store opening','product launch sale',
    '운세','타로','점성술','맛집','패션','뷰티','육아 팁','건강 상식','열애설','경기 결과',
    '이적설','할인 행사','지역 축제'
  ]::text[],
  NULL, NULL, 'all', 40, true, true,
  '시스템 seed — 운세·연예·맛집·스포츠 잡담 등',
  'system', 'system'
),
(
  'a1000001-0001-4000-8000-000000000012',
  '기본 제외: 소프트 과학·호기심',
  'keyword',
  'exclude',
  ARRAY[
    'archaeology dig','dinosaur fossil','astronomy photo','cute animal','space selfie',
    '고고학 발굴','공룡 화석','우주 사진','귀여운 동물'
  ]::text[],
  NULL, NULL, 'all', 35, true, true,
  '시스템 seed — 일반 호기심 과학',
  'system', 'system'
)
ON CONFLICT (id) DO NOTHING;
