-- Protect admin-set editorial_priority from AI overwrite.
-- Safe to run multiple times.

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS editorial_priority_manual boolean DEFAULT false;

UPDATE public.articles
SET editorial_priority_manual = COALESCE(editorial_priority_manual, false)
WHERE editorial_priority_manual IS NULL;

ALTER TABLE public.articles
  ALTER COLUMN editorial_priority_manual SET DEFAULT false,
  ALTER COLUMN editorial_priority_manual SET NOT NULL;
