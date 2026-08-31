-- Editorial interest rules for desk triage (apply in Supabase SQL editor).

CREATE TABLE IF NOT EXISTS public.editorial_interest_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  content_description text,
  countries text[] NOT NULL DEFAULT '{}',
  people text[] NOT NULL DEFAULT '{}',
  organizations text[] NOT NULL DEFAULT '{}',
  topics text[] NOT NULL DEFAULT '{}',
  exclude_topics text[] NOT NULL DEFAULT '{}',
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS editorial_interest_rules_active_priority_idx
  ON public.editorial_interest_rules (is_active, priority DESC);

COMMENT ON TABLE public.editorial_interest_rules IS
  'Desk interest criteria for candidate matching and AI recommend prompts.';
