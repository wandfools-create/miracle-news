/** Home / edition list fetch: bound at DB, not full published dump. */
export const HOME_PUBLISHED_FETCH_LIMIT = 200;

export type PublishedArticlesFetchOptions = {
  /** Applied with `.limit()` at query time. Default: HOME_PUBLISHED_FETCH_LIMIT. */
  limit?: number;
  /** When false, omit localization body (home cards). Default true for search haystack. */
  includeBody?: boolean;
};
