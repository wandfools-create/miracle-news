import "server-only";

import { collectRowsByRangePagination } from "@/lib/collection-candidates/candidateFetchPagination";
import {
  newsWireIdOrder,
  nyDateKeyBounds,
  paginateNewsWireItems,
  parseNewsWirePage,
  rankDbRowsToPublicItems,
  selectHomeNewsWireItems,
  todayNyDateKey,
} from "@/lib/news-wire/newsWireQuery";
import {
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

export {
  newsWireIdOrder,
  nyDateKeyBounds,
  parseNewsWirePage,
  todayNyDateKey,
};

type ServiceClient = ReturnType<
  typeof createServiceRoleSupabaseClient
>["client"];

function isMissingWireColumn(error: {
  code?: string;
  message?: string;
  details?: string;
}): boolean {
  const blob =
    `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (
    blob.includes("rss_title_en") ||
    blob.includes("wire_titles_ready_at") ||
    blob.includes("42703") ||
    (blob.includes("column") && blob.includes("does not exist"))
  );
}

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
 * Exclude candidates whose linked article is already live/public editorial.
 * Keep enrich_failed even if article_id is set (partial failure).
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

async function fetchAllWireRowsInCreatedWindow(options: {
  client: ServiceClient;
  gteIso: string;
  ltIso?: string;
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
        .in("status", NEWS_WIRE_INCLUDE_STATUSES)
        .gte("created_at", options.gteIso)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      if (options.ltIso) {
        query = query.lt("created_at", options.ltIso);
      }
      const { data, error } = await query;
      if (error) {
        if (isMissingWireColumn(error) || isMissingRelation(error)) {
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
  schemaReady: boolean;
  error: string | null;
};

export async function fetchNewsWireDayPage(options: {
  locale: NewsWireLocale;
  dateKey: string;
  page?: number;
  nowMs?: number;
}): Promise<NewsWireDayPage> {
  const page = parseNewsWirePage(options.page ?? 1);
  const empty = (extra: Partial<NewsWireDayPage>): NewsWireDayPage => ({
    items: [],
    dateKey: options.dateKey,
    page,
    pageSize: NEWS_WIRE_PAGE_SIZE,
    hasMore: false,
    totalReady: 0,
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
    const fetched = await fetchAllWireRowsInCreatedWindow({
      client,
      gteIso: bounds.startIso,
      ltIso: bounds.endIso,
    });
    if (!fetched.ok) {
      return empty({
        schemaReady: fetched.schemaReady,
        error: fetched.error,
      });
    }

    const filtered = await filterDuplicateLiveArticles(client, fetched.rows);
    const nowMs = options.nowMs ?? Date.now();
    const ranked = rankDbRowsToPublicItems(filtered, options.locale, nowMs);
    const sliced = paginateNewsWireItems(ranked, page);
    return {
      items: sliced.items,
      dateKey: options.dateKey,
      page: sliced.page,
      pageSize: sliced.pageSize,
      hasMore: sliced.hasMore,
      totalReady: sliced.totalReady,
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
