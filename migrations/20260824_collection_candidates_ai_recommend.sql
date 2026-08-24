-- AI recommend grades for collection_candidates (title+summary only; no article body).
-- Apply in Supabase SQL editor before using 「AI 추천 갱신」.

ALTER TABLE public.collection_candidates
  ADD COLUMN IF NOT EXISTS ai_recommend_grade text;

ALTER TABLE public.collection_candidates
  ADD COLUMN IF NOT EXISTS ai_recommend_score integer;

ALTER TABLE public.collection_candidates
  ADD COLUMN IF NOT EXISTS ai_recommend_reason text;

ALTER TABLE public.collection_candidates
  ADD COLUMN IF NOT EXISTS ai_recommended_at timestamptz;

COMMENT ON COLUMN public.collection_candidates.ai_recommend_grade IS
  'best | priority | normal | low — filter ranking only; separate from article AI category';

CREATE INDEX IF NOT EXISTS collection_candidates_ai_recommend_idx
  ON public.collection_candidates (ai_recommend_grade, ai_recommended_at DESC NULLS LAST);
