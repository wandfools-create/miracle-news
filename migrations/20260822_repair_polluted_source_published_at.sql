-- One-time repair: source_published_at polluted by republish / site-publish backfill.
-- Do NOT rewrite all rows — only clearly wrong values.

-- 1a) Prefer collection_candidates.rss_published_at when URL matches and
--     source_published_at was clearly copied from site published_at (within 2s)
--     while RSS is earlier (true source clock).
UPDATE public.articles AS a
SET source_published_at = cc.rss_published_at
FROM public.collection_candidates AS cc
WHERE cc.rss_published_at IS NOT NULL
  AND a.original_url IS NOT NULL
  AND a.published_at IS NOT NULL
  AND a.source_published_at IS NOT NULL
  AND (
    cc.original_url = a.original_url
    OR split_part(cc.original_url, '?', 1) = split_part(a.original_url, '?', 1)
  )
  AND abs(extract(epoch from (a.source_published_at - a.published_at))) < 2
  AND cc.rss_published_at < a.source_published_at;

-- 1b) spa more than 7 days after created_at — recover from RSS when available.
UPDATE public.articles AS a
SET source_published_at = cc.rss_published_at
FROM public.collection_candidates AS cc
WHERE cc.rss_published_at IS NOT NULL
  AND a.original_url IS NOT NULL
  AND a.created_at IS NOT NULL
  AND a.source_published_at IS NOT NULL
  AND (
    cc.original_url = a.original_url
    OR split_part(cc.original_url, '?', 1) = split_part(a.original_url, '?', 1)
  )
  AND a.source_published_at > a.created_at + interval '7 days'
  AND cc.rss_published_at < a.source_published_at;

-- 2) Remaining polluted rows (spa ≈ published_at AND spa > created_at + 7d)
--    without a usable candidate: use collected_at, else created_at.
UPDATE public.articles AS a
SET source_published_at = COALESCE(a.collected_at, a.created_at)
WHERE a.created_at IS NOT NULL
  AND a.source_published_at IS NOT NULL
  AND a.published_at IS NOT NULL
  AND a.source_published_at > a.created_at + interval '7 days'
  AND abs(extract(epoch from (a.source_published_at - a.published_at))) < 2
  AND NOT EXISTS (
    SELECT 1
    FROM public.collection_candidates AS cc
    WHERE cc.rss_published_at IS NOT NULL
      AND a.original_url IS NOT NULL
      AND (
        cc.original_url = a.original_url
        OR split_part(cc.original_url, '?', 1) = split_part(a.original_url, '?', 1)
      )
      AND cc.rss_published_at < a.source_published_at
  );
