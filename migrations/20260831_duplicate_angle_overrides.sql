-- Audit log for duplicate-angle admin overrides (apply in Supabase SQL editor).

CREATE TABLE IF NOT EXISTS public.duplicate_angle_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL,
  action text NOT NULL,
  candidate_id uuid,
  article_id uuid,
  matched_article_id uuid,
  original_url text,
  source text,
  classification text NOT NULL,
  override_reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS duplicate_angle_overrides_created_at_idx
  ON public.duplicate_angle_overrides (created_at DESC);

COMMENT ON TABLE public.duplicate_angle_overrides IS
  'Admin duplicate-angle override audit — not publish approval.';
