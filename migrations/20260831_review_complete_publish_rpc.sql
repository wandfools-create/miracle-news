-- Atomic review-complete-and-publish (optional RPC — apply in Supabase SQL editor).
-- TypeScript publish path remains authoritative until this RPC is deployed.

CREATE OR REPLACE FUNCTION public.review_complete_and_publish_article(
  p_article_id uuid,
  p_approved_by text DEFAULT 'admin',
  p_allow_same_event_override boolean DEFAULT false
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

COMMENT ON FUNCTION public.review_complete_and_publish_article IS
  'Single-step pending review → published. Content/localization guards run in app layer before RPC.';
