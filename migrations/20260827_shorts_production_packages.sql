-- Shorts Studio Phase 2: AI production package drafts (admin-only, not auto-published).
-- Safe to run multiple times. Do NOT apply to Production until approved.
-- Access model: service_role only (RLS enabled; no anon/authenticated write policies).

CREATE TABLE IF NOT EXISTS public.shorts_production_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  desk text NOT NULL CHECK (desk IN ('morning', 'evening')),
  edit_date date NOT NULL,
  article_ids uuid[] NOT NULL,

  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed')),

  package jsonb NOT NULL,
  CONSTRAINT shorts_production_packages_package_object
    CHECK (jsonb_typeof(package) = 'object'),

  generation_mode text NOT NULL DEFAULT 'stub' CHECK (generation_mode IN ('stub', 'openai')),
  created_by text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,

  CONSTRAINT shorts_production_packages_article_ids_len
    CHECK (cardinality(article_ids) BETWEEN 3 AND 5)
);

-- Idempotent column add for environments that created an earlier draft of this table.
ALTER TABLE public.shorts_production_packages
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shorts_production_packages_package_object'
  ) THEN
    ALTER TABLE public.shorts_production_packages
      ADD CONSTRAINT shorts_production_packages_package_object
      CHECK (jsonb_typeof(package) = 'object');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shorts_production_packages_edit_date_desk_idx
  ON public.shorts_production_packages (edit_date DESC, desk);

CREATE INDEX IF NOT EXISTS shorts_production_packages_created_at_idx
  ON public.shorts_production_packages (created_at DESC);

CREATE INDEX IF NOT EXISTS shorts_production_packages_status_updated_idx
  ON public.shorts_production_packages (status, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_shorts_production_packages_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shorts_production_packages_updated_at ON public.shorts_production_packages;

CREATE TRIGGER shorts_production_packages_updated_at
  BEFORE UPDATE ON public.shorts_production_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_shorts_production_packages_updated_at();

ALTER TABLE public.shorts_production_packages ENABLE ROW LEVEL SECURITY;

-- No policies for anon or authenticated — clients cannot read/write directly.
DROP POLICY IF EXISTS shorts_production_packages_service_role_all ON public.shorts_production_packages;

CREATE POLICY shorts_production_packages_service_role_all
  ON public.shorts_production_packages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.shorts_production_packages IS
  'Admin Shorts AI production package drafts. Human review required; never auto-published. Service-role server access only.';
