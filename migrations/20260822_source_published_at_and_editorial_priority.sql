-- Source freshness + editorial priority for home ranking.
-- Safe to run multiple times.

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS source_published_at timestamptz;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS editorial_priority text DEFAULT 'normal';

-- Backfill: historical published_at values were mostly source/RSS times.
UPDATE public.articles
SET source_published_at = published_at
WHERE source_published_at IS NULL
  AND published_at IS NOT NULL;

UPDATE public.articles
SET editorial_priority = 'normal'
WHERE editorial_priority IS NULL
   OR editorial_priority NOT IN ('normal', 'issue', 'special', 'breaking');

ALTER TABLE public.articles
  ALTER COLUMN editorial_priority SET DEFAULT 'normal',
  ALTER COLUMN editorial_priority SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'articles_editorial_priority_check'
  ) THEN
    ALTER TABLE public.articles
      ADD CONSTRAINT articles_editorial_priority_check
      CHECK (editorial_priority IN ('normal', 'issue', 'special', 'breaking'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS articles_source_published_at_idx
  ON public.articles (source_published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS articles_editorial_priority_idx
  ON public.articles (editorial_priority);
