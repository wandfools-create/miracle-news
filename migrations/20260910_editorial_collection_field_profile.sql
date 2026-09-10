-- Editorial collection field profile (simple admin field checkboxes).
-- Additive only. Do NOT modify 20260909_editorial_collection_controls_v2.sql.
-- Idempotent. Apply separately when ready — not in this PR session.

CREATE TABLE IF NOT EXISTS public.editorial_collection_profile (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  accept_unclassified boolean NOT NULL DEFAULT false,
  region_scope text NOT NULL DEFAULT 'all'
    CHECK (region_scope IN ('all', 'korea', 'us', 'intl')),
  -- { [fieldId]: { enabled, collectKeywords?, excludeKeywords?, labelKo?, realm?, isCustom?, deletedAt? } }
  field_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- [ { iso, nameKo, enabled, collectKeywords, excludeKeywords, deletedAt? } ]
  countries jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.editorial_collection_profile (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.editorial_collection_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS editorial_collection_profile_service_role_all
  ON public.editorial_collection_profile;
CREATE POLICY editorial_collection_profile_service_role_all
  ON public.editorial_collection_profile
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.editorial_collection_profile FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.editorial_collection_profile TO service_role;

COMMENT ON TABLE public.editorial_collection_profile IS
  'Singleton admin field/country intake profile. Does not change AI importance scores.';
