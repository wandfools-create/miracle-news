-- Phase 1 home editorial ranking: denormalized AI recommend snapshot on articles.
-- Apply before Production deploy of feature/home-editorial-ranking-v1 (not auto-run).
-- Runtime Phase 1 joins collection_candidates.article_id when these columns are absent.
-- After applying this migration, set ARTICLES_AI_RECOMMEND_SNAPSHOT=1 so promote
-- can denormalize grade/score onto articles (default OFF avoids schema errors).

alter table public.articles
  add column if not exists ai_recommend_grade text;

alter table public.articles
  add column if not exists ai_recommend_score integer;

comment on column public.articles.ai_recommend_grade is
  'Snapshot of collection_candidates.ai_recommend_grade at promote (best|priority|normal|low). Nullable for legacy rows.';

comment on column public.articles.ai_recommend_score is
  'Snapshot of collection_candidates.ai_recommend_score (0-100) at promote. Nullable for legacy rows.';
