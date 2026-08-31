-- Atomic review-complete-and-publish status transition.
-- Apply only after explicit ops approval — not applied by this PR.
-- App-layer content / SAME EVENT / localization guards run BEFORE calling this RPC.
-- TypeScript publish path remains usable until this function is deployed.

CREATE OR REPLACE FUNCTION public.review_complete_and_publish_article(
  p_article_id uuid,
  p_approved_by text DEFAULT 'admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row articles%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_row
  FROM articles
  WHERE id = p_article_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'step', 'fetch', 'error', 'not_found');
  END IF;

  IF v_row.is_published IS TRUE OR v_row.status = 'published' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'published_at', COALESCE(v_row.published_at, v_now),
      'first_publish', false
    );
  END IF;

  IF v_row.review_status IS DISTINCT FROM 'pending'
     OR v_row.status IS DISTINCT FROM 'ready_for_human_review' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'step', 'status_guard',
      'error', 'not_pending_review'
    );
  END IF;

  UPDATE articles
  SET
    status = 'published',
    review_status = 'approved',
    revision_status = 'none',
    is_published = true,
    published_at = COALESCE(published_at, v_now),
    approved_at = v_now,
    approved_by = COALESCE(NULLIF(trim(p_approved_by), ''), 'admin')
  WHERE id = p_article_id
    AND review_status = 'pending'
    AND status = 'ready_for_human_review'
    AND is_published IS NOT TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'step', 'publish_update',
      'error', 'race_or_already_published'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'published_at', (SELECT published_at FROM articles WHERE id = p_article_id),
    'first_publish', true
  );
END;
$$;

COMMENT ON FUNCTION public.review_complete_and_publish_article(uuid, text) IS
  'Pending review → published status transition with row lock. Content/localization guards run in the app before RPC. Browser callers must not execute this function.';

-- Harden: deny direct browser / anon / authenticated execution.
REVOKE ALL ON FUNCTION public.review_complete_and_publish_article(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_complete_and_publish_article(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.review_complete_and_publish_article(uuid, text) FROM authenticated;

-- Server-only service role path (Next.js service role client) may execute.
GRANT EXECUTE ON FUNCTION public.review_complete_and_publish_article(uuid, text) TO service_role;
