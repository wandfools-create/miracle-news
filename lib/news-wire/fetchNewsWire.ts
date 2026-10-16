import "server-only";

import { collectRowsByRangePagination } from "@/lib/collection-candidates/candidateFetchPagination";
import {
  archiveDbRowsToPublicItems,
  buildHannoonArticleHref,
  isPublicHannoonArticle,
  newsWireArchiveDbRange,
  newsWireArchiveHasMore,
  newsWireArchivePageCount,
  newsWireIdOrder,
  nyDateKeyBounds,
  parseNewsWirePage,
  selectHomeNewsWireItems,
  todayNyDateKey,
} from "@/lib/news-wire/newsWireQuery";
import {
  NEWS_WIRE_ARCHIVE_INCLUDE_STATUSES,
  NEWS_WIRE_DB_SELECT,
  NEWS_WIRE_FETCH_MAX_PAGES,
  NEWS_WIRE_FETCH_PAGE_SIZE,
  NEWS_WIRE_HOME_LOOKBACK_MS,
  NEWS_WIRE_INCLUDE_STATUSES,
  NEWS_WIRE_PAGE_SIZE,
  type NewsWireDbRow,
  type NewsWireItem,
  type NewsWireLocale,
} from "@/lib/news-wire/types";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";
import type { CollectionCandidateStatus } from "@/lib/collection-candidates/types";

export {
  newsWireIdOrder,
  nyDateKeyBounds,
  parseNewsWirePage,
  todayNyDateKey,
};

type ServiceClient = ReturnType<
  typeof createServiceRoleSupabaseClient
>["client"];

function isMissingRelation(error: {
  code?: string;
  message?: string;
}): boolean {
  const code = (error.code ?? "").trim();
  if (code === "42P01" || code === "PGRST205") return true;
  const blob = `${error.message ?? ""}`.toLowerCase();
  return (
    blob.includes("collection_candidates") && blob.includes("does not exist")
  );
}

/**
 * Homepage only: exclude candidates whose linked article is already
 * live/public editorial so the rail stays non-duplicate with home cards.
 * Archive path must NOT use this — articleized rows stay visible.
 */
async function filterDuplicateLiveArticles(
  client: ServiceClient,
  rows: NewsWireDbRow[]
): Promise<NewsWireDbRow[]> {
  const linked = rows.filter(
    (r) => r.article_id && r.status !== "enrich_failed"
  );
  if (linked.length === 0) return rows;

  const articleIds = [
    ...new Set(linked.map((r) => r.article_id!).filter(Boolean)),
  ];
  const hide = new Set<string>();

  for (let i = 0; i < articleIds.length; i += 200) {
    const chunk = articleIds.slice(i, i + 200);
    const { data, error } = await client
      .from("articles")
      .select("id, is_published, status")
      .in("id", chunk);
    if (error || !data) continue;
    for (const article of data) {
      const published = article.is_published === true;
      const status = String(article.status ?? "");
      if (
        published ||
        status === "published" ||
        status === "ready_for_human_review" ||
        status === "approved" ||
        status === "needs_revision"
      ) {
        hide.add(String(article.id));
      }
    }
  }

  return rows.filter(
    (r) =>
      !(
        r.article_id &&
        r.status !== "enrich_failed" &&
        hide.has(r.article_id)
      )
  );
}

/**
 * Resolve public Hannoon hrefs using the same publish gates as SEO/home:
 * approved + is_published + status published + published_at + locale slug.
 */
async function resolvePublishedHannoonHrefs(
  client: ServiceClient,
  articleIds: string[],
  locale: NewsWireLocale
): Promise<Map<string, string>> {
  const hrefByArticleId = new Map<string, string>();
  const unique = [...new Set(articleIds.filter(Boolean))];
  if (unique.length === 0) return hrefByArticleId;

  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const { data, error } = await client
      .from("article_localizations")
      .select(
        `
        article_id,
        slug,
        locale,
        articles!inner (
          id,
          is_published,
          status,
          review_status,
          published_at
        )
      `
      )
      .in("article_id", chunk)
      .eq("locale", locale);

    if (error || !data) continue;

    for (const row of data) {
      const articleRaw = row.articles;
      const article = Array.isArray(articleRaw) ? articleRaw[0] : articleRaw;
      if (!article || !isPublicHannoonArticle(article)) continue;
      const href = buildHannoonArticleHref(locale, row.slug);
      if (!href) continue;
      hrefByArticleId.set(String(row.article_id), href);
    }
  }

  return hrefByArticleId;
}

/** Home preview only — still scans the lookback window in batches. */
async function fetchAllWireRowsInCreatedWindow(options: {
  client: ServiceClient;
  gteIso: string;
  ltIso?: string;
  statuses: readonly CollectionCandidateStatus[];
}): Promise<
  | { ok: true; rows: NewsWireDbRow[]; schemaReady: true }
  | { ok: false; schemaReady: boolean; error: string | null }
> {
  let pageCount = 0;
  const result = await collectRowsByRangePagination<NewsWireDbRow>(
    async (from, to) => {
      pageCount += 1;
      if (pageCount > NEWS_WIRE_FETCH_MAX_PAGES) {
        return { ok: true, rows: [] };
      }
      let query = options.client
        .from("collection_candidates")
        .select(NEWS_WIRE_DB_SELECT)
        .in("status", [...options.statuses])
        .gte("created_at", options.gteIso)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      if (options.ltIso) {
        query = query.lt("created_at", options.ltIso);
      }
      const { data, error } = await query;
      if (error) {
        if (isMissingRelation(error)) {
          return { ok: false, error: "__schema_missing__" };
        }
        return { ok: false, error: error.message };
      }
      return { ok: true, rows: (data ?? []) as unknown as NewsWireDbRow[] };
    },
    NEWS_WIRE_FETCH_PAGE_SIZE
  );

  if (!result.ok) {
    if (result.error === "__schema_missing__") {
      return { ok: false, schemaReady: false, error: null };
    }
    return { ok: false, schemaReady: true, error: result.error };
  }
  return { ok: true, rows: result.rows, schemaReady: true };
}

export async function fetchHomeNewsWireItems(options?: {
  locale?: NewsWireLocale;
  nowMs?: number;
}): Promise<{
  items: NewsWireItem[];
  schemaReady: boolean;
  error: string | null;
}> {
  const nowMs = options?.nowMs ?? Date.now();
  const locale = options?.locale ?? "ko";
  const sinceIso = new Date(nowMs - NEWS_WIRE_HOME_LOOKBACK_MS).toISOString();

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { items: [], schemaReady: false, error: envCheck.error };
  }

  try {
    const { client } = createServiceRoleSupabaseClient();
    const fetched = await fetchAllWireRowsInCreatedWindow({
      client,
      gteIso: sinceIso,
      statuses: NEWS_WIRE_INCLUDE_STATUSES,
    });
    if (!fetched.ok) {
      return {
        items: [],
        schemaReady: fetched.schemaReady,
        error: fetched.error,
      };
    }

    const filtered = await filterDuplicateLiveArticles(client, fetched.rows);
    return {
      items: selectHomeNewsWireItems(filtered, locale, nowMs),
      schemaReady: true,
      error: null,
    };
  } catch (err) {
    return {
      items: [],
      schemaReady: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type NewsWireDayPage = {
  items: NewsWireItem[];
  dateKey: string;
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalReady: number;
  pageCount: number;
  schemaReady: boolean;
  error: string | null;
};

/**
 * Permanent /wire day archive: one exact count + one paged SELECT.
 * Does not walk the full day with collectRowsByRangePagination.
 */
export async function fetchNewsWireDayPage(options: {
  locale: NewsWireLocale;
  dateKey: string;
  page?: number;
  nowMs?: number;
}): Promise<NewsWireDayPage> {
  const { page, from, to } = newsWireArchiveDbRange(options.page ?? 1);
  const empty = (extra: Partial<NewsWireDayPage>): NewsWireDayPage => ({
    items: [],
    dateKey: options.dateKey,
    page,
    pageSize: NEWS_WIRE_PAGE_SIZE,
    hasMore: false,
    totalReady: 0,
    pageCount: 0,
    schemaReady: true,
    error: null,
    ...extra,
  });

  const bounds = nyDateKeyBounds(options.dateKey);
  if (!bounds) {
    return empty({ error: "invalid_date" });
  }

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return empty({ schemaReady: false, error: null });
  }

  try {
    const { client } = createServiceRoleSupabaseClient();
    const statuses = [...NEWS_WIRE_ARCHIVE_INCLUDE_STATUSES];

    const { count, error: countError } = await client
      .from("collection_candidates")
      .select("id", { count: "exact", head: true })
      .in("status", statuses)
      .gte("created_at", bounds.startIso)
      .lt("created_at", bounds.endIso);

    if (countError) {
      if (isMissingRelation(countError)) {
        return empty({ schemaReady: false, error: null });
      }
      return empty({ schemaReady: true, error: countError.message });
    }

    const totalReady = count ?? 0;
    const pageCount = newsWireArchivePageCount(totalReady);

    const { data, error } = await client
      .from("collection_candidates")
      .select(NEWS_WIRE_DB_SELECT)
      .in("status", statuses)
      .gte("created_at", bounds.startIso)
      .lt("created_at", bounds.endIso)
      .order("rss_published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      if (isMissingRelation(error)) {
        return empty({ schemaReady: false, error: null });
      }
      return empty({ schemaReady: true, error: error.message });
    }

    const pageRows = (data ?? []) as unknown as NewsWireDbRow[];
    // At most one DB page of candidates (≤ NEWS_WIRE_PAGE_SIZE).
    const articleIds = pageRows
      .map((r) => r.article_id)
      .filter((id): id is string => Boolean(id));
    const hannoonHrefByArticleId = await resolvePublishedHannoonHrefs(
      client,
      articleIds,
      options.locale
    );
    const items = archiveDbRowsToPublicItems(
      pageRows,
      options.locale,
      hannoonHrefByArticleId
    );

    return {
      items,
      dateKey: options.dateKey,
      page,
      pageSize: NEWS_WIRE_PAGE_SIZE,
      hasMore: newsWireArchiveHasMore(page, totalReady),
      totalReady,
      pageCount,
      schemaReady: true,
      error: null,
    };
  } catch (err) {
    return empty({
      schemaReady: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
