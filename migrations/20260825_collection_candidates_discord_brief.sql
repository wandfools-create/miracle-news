-- Discord Morning Brief delivery tracking (no backfill).
-- Apply in Supabase SQL editor before enabling /api/cron/morning-brief.

ALTER TABLE public.collection_candidates
  ADD COLUMN IF NOT EXISTS discord_brief_sent_at timestamptz;

ALTER TABLE public.collection_candidates
  ADD COLUMN IF NOT EXISTS discord_brief_message_id text;

COMMENT ON COLUMN public.collection_candidates.discord_brief_sent_at IS
  'When this candidate was posted to Discord #morning-brief';

COMMENT ON COLUMN public.collection_candidates.discord_brief_message_id IS
  'Discord message snowflake id for Morning Brief post';

CREATE INDEX IF NOT EXISTS collection_candidates_discord_brief_pending_idx
  ON public.collection_candidates (ai_recommend_grade, ai_recommended_at DESC NULLS LAST)
  WHERE discord_brief_sent_at IS NULL
    AND ai_recommended_at IS NOT NULL;
