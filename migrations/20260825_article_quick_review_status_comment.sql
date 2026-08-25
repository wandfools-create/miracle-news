-- Document quick_review landing status for Discord/admin fast-publish flow.
-- No CHECK constraints; comments only (same pattern as archived status).

COMMENT ON COLUMN public.articles.status IS
  'Workflow: ready_for_human_review | needs_revision | approved | published | rejected | archived';

COMMENT ON COLUMN public.articles.review_status IS
  'Review: pending | quick_review | on_hold | needs_revision | approved | rejected | archived';
