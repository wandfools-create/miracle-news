/** Sort keys for selecting the home published article pool (one row per article). */
export type HomePublishedArticleSortRow = {
  id: string;
  source_published_at: string | null;
  published_at: string | null;
};

/** DESC with nulls last — matches Supabase nullsFirst: false on home fetches. */
function compareTimestampDesc(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  const left = a ?? null;
  const right = b ?? null;
  if (left === right) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left > right ? -1 : 1;
}

/** Stable ordering for the shared home article pool. */
export function compareHomePublishedArticles(
  a: HomePublishedArticleSortRow,
  b: HomePublishedArticleSortRow
): number {
  const sourceCmp = compareTimestampDesc(
    a.source_published_at,
    b.source_published_at
  );
  if (sourceCmp !== 0) return sourceCmp;

  const publishedCmp = compareTimestampDesc(a.published_at, b.published_at);
  if (publishedCmp !== 0) return publishedCmp;

  if (a.id === b.id) return 0;
  return a.id > b.id ? -1 : 1;
}

/** Legacy per-locale pools — timestamps only (no article_id tie-break). */
export function compareHomePublishedArticlesLegacyTimestamps(
  a: HomePublishedArticleSortRow,
  b: HomePublishedArticleSortRow
): number {
  const sourceCmp = compareTimestampDesc(
    a.source_published_at,
    b.source_published_at
  );
  if (sourceCmp !== 0) return sourceCmp;
  return compareTimestampDesc(a.published_at, b.published_at);
}

/** @internal Test helper — simulates legacy per-locale limit pools. */
export function simulateLegacyLocalePoolArticleIds(
  localizationRows: Array<
    HomePublishedArticleSortRow & {
      locale: "ko" | "en";
      article_id: string;
    }
  >,
  locale: "ko" | "en",
  limit: number,
  options?: { unstableTieBreak?: boolean; legacyTimestampSort?: boolean }
): Set<string> {
  const compare = options?.legacyTimestampSort
    ? compareHomePublishedArticlesLegacyTimestamps
    : compareHomePublishedArticles;

  const pool = localizationRows
    .filter((row) => row.locale === locale)
    .sort((a, b) => {
      const base = compare(a, b);
      if (base !== 0) return base;
      if (options?.unstableTieBreak) {
        return locale === "ko"
          ? a.article_id.localeCompare(b.article_id)
          : b.article_id.localeCompare(a.article_id);
      }
      return 0;
    })
    .slice(0, limit)
    .map((row) => row.article_id);
  return new Set(pool);
}

/** Top N unique published article ids for the home pool. */
export function selectHomePublishedArticleIds(
  articles: HomePublishedArticleSortRow[],
  limit: number
): string[] {
  return [...articles]
    .sort(compareHomePublishedArticles)
    .slice(0, limit)
    .map((row) => row.id);
}
