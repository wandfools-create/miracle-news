-- Atomic review-complete-and-publish: KO/EN localizations + article publish
-- in ONE transaction. Apply only after explicit ops approval — not applied by this PR.
--
-- App-layer content / SAME EVENT guards run BEFORE calling this RPC.
-- Server-only service_role may execute. Browser / anon / authenticated cannot.
-- If this function is missing, the app must fail closed (no TS fallback writes).

DROP FUNCTION IF EXISTS public.review_complete_and_publish_article(uuid, text);
DROP FUNCTION IF EXISTS public.review_complete_and_publish_article(uuid, text, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.review_complete_and_publish_article(
  p_article_id uuid,
  p_approved_by text,
  p_ko jsonb,
  p_en jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row articles%ROWTYPE;
  v_now timestamptz := now();
  v_approved_by text := COALESCE(NULLIF(trim(p_approved_by), ''), 'admin');
  v_ko_title text;
  v_ko_summary text;
  v_ko_body text;
  v_ko_slug text;
  v_ko_meta text;
  v_en_title text;
  v_en_summary text;
  v_en_body text;
  v_en_slug text;
  v_en_meta text;
  v_updated int;
BEGIN
  -- Validate localization payloads before locking (fail fast, no side effects).
  IF p_ko IS NULL OR p_en IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'step', 'localizations',
      'error', 'missing_localization_payload'
    );
  END IF;

  v_ko_title := NULLIF(trim(COALESCE(p_ko->>'title', '')), '');
  v_ko_summary := NULLIF(trim(COALESCE(p_ko->>'summary', '')), '');
  v_ko_body := NULLIF(trim(COALESCE(p_ko->>'body', '')), '');
  v_ko_slug := NULLIF(trim(COALESCE(p_ko->>'slug', '')), '');
  v_ko_meta := NULLIF(trim(COALESCE(p_ko->>'meta_description', '')), '');

  v_en_title := NULLIF(trim(COALESCE(p_en->>'title', '')), '');
  v_en_summary := NULLIF(trim(COALESCE(p_en->>'summary', '')), '');
  v_en_body := NULLIF(trim(COALESCE(p_en->>'body', '')), '');
  v_en_slug := NULLIF(trim(COALESCE(p_en->>'slug', '')), '');
  v_en_meta := NULLIF(trim(COALESCE(p_en->>'meta_description', '')), '');

  IF v_ko_title IS NULL OR v_ko_body IS NULL OR v_ko_summary IS NULL OR v_ko_slug IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'step', 'localizations',
      'error', 'invalid_ko_localization'
    );
  END IF;

  IF v_en_title IS NULL OR v_en_slug IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'step', 'localizations',
      'error', 'invalid_en_localization'
    );
  END IF;

  SELECT * INTO v_row
    FROM articles
   WHERE id = p_article_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'step', 'fetch', 'error', 'not_found');
  END IF;

  -- Idempotent success for already-live articles (no localization rewrite).
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

  -- KO upsert (UPDATE then INSERT — no unique-constraint assumption).
  UPDATE article_localizations
     SET title = v_ko_title,
         summary = v_ko_summary,
         body = v_ko_body,
         slug = v_ko_slug,
         meta_description = COALESCE(v_ko_meta, v_ko_summary)
   WHERE article_id = p_article_id
     AND locale = 'ko';

  IF NOT FOUND THEN
    INSERT INTO article_localizations (
      article_id, locale, title, summary, body, slug, meta_description, is_primary_locale
    ) VALUES (
      p_article_id, 'ko', v_ko_title, v_ko_summary, v_ko_body, v_ko_slug,
      COALESCE(v_ko_meta, v_ko_summary), true
    );
  END IF;

  -- EN upsert
  UPDATE article_localizations
     SET title = v_en_title,
         summary = v_en_summary,
         body = v_en_body,
         slug = v_en_slug,
         meta_description = COALESCE(v_en_meta, v_en_summary)
   WHERE article_id = p_article_id
     AND locale = 'en';

  IF NOT FOUND THEN
    INSERT INTO article_localizations (
      article_id, locale, title, summary, body, slug, meta_description, is_primary_locale
    ) VALUES (
      p_article_id, 'en', v_en_title, v_en_summary, v_en_body, v_en_slug,
      COALESCE(v_en_meta, v_en_summary), false
    );
  END IF;

  -- Verify both locales exist with non-empty titles after upsert.
  IF (
    SELECT COUNT(*)::int
      FROM article_localizations
     WHERE article_id = p_article_id
       AND locale IN ('ko', 'en')
       AND NULLIF(trim(title), '') IS NOT NULL
  ) < 2 THEN
    RAISE EXCEPTION 'localization_verify_failed'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE articles
     SET status = 'published',
         review_status = 'approved',
         revision_status = 'none',
         is_published = true,
         published_at = COALESCE(published_at, v_now),
         approved_at = v_now,
         approved_by = v_approved_by
   WHERE id = p_article_id
     AND review_status = 'pending'
     AND status = 'ready_for_human_review'
     AND is_published IS NOT TRUE;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'publish_update_race'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'published_at', (SELECT published_at FROM articles WHERE id = p_article_id),
    'first_publish', true
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Any failure rolls back localization + article writes in this function.
    RETURN jsonb_build_object(
      'ok', false,
      'step', CASE
        WHEN SQLERRM = 'localization_verify_failed' THEN 'localizations'
        WHEN SQLERRM = 'publish_update_race' THEN 'publish_update'
        ELSE 'rpc'
      END,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.review_complete_and_publish_article(uuid, text, jsonb, jsonb) IS
  'Atomic pending-review → published: KO/EN localization upsert + article approve/publish in one transaction. Content/SAME EVENT guards run in the app before RPC. Browser callers must not execute.';

REVOKE ALL ON FUNCTION public.review_complete_and_publish_article(uuid, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_complete_and_publish_article(uuid, text, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.review_complete_and_publish_article(uuid, text, jsonb, jsonb) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.review_complete_and_publish_article(uuid, text, jsonb, jsonb) TO service_role;
