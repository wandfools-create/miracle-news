-- Add manual top story columns for admin control.
-- Safe to run multiple times.

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS is_top_story boolean DEFAULT false;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS top_story_order integer DEFAULT 0;

-- If legacy column exists, migrate values once.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'articles'
      AND column_name = 'is_featured'
  ) THEN
    EXECUTE '
      UPDATE public.articles
      SET is_top_story = COALESCE(is_featured, false)
      WHERE COALESCE(is_top_story, false) = false
    ';
  END IF;
END $$;

UPDATE public.articles
SET is_top_story = COALESCE(is_top_story, false)
WHERE is_top_story IS NULL;

UPDATE public.articles
SET top_story_order = COALESCE(top_story_order, 0)
WHERE top_story_order IS NULL;

ALTER TABLE public.articles
  ALTER COLUMN is_top_story SET DEFAULT false,
  ALTER COLUMN is_top_story SET NOT NULL,
  ALTER COLUMN top_story_order SET DEFAULT 0,
  ALTER COLUMN top_story_order SET NOT NULL;
