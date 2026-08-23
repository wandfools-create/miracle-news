-- Soft-archive status for stale unused review-queue drafts (admin cleanup).
-- No CHECK constraints on articles.status / review_status today; this documents
-- the new values used by lib/admin/cleanup and ARTICLE_WORKFLOW.archived.
-- Safe to run: does not alter existing rows.

COMMENT ON COLUMN public.articles.status IS
  'Workflow: ready_for_human_review | needs_revision | approved | published | rejected | archived';

COMMENT ON COLUMN public.articles.review_status IS
  'Editorial queue: pending | on_hold | needs_revision | approved | rejected | archived';
