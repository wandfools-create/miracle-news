import "server-only";

import { localizeSourceLabel } from "@/lib/article/sourceDisplayLabels";
import { getArticleSourceLabel } from "@/lib/article/sourceResolution";
import { parseWireGrade, compareNewsWireItems } from "@/lib/news-wire/rankNewsWire";
import {
  NEWS_WIRE_DB_SELECT,
  NEWS_WIRE_HOME_LIMIT,
  NEWS_WIRE_HOME_LOOKBACK_MS,
  NEWS_WIRE_INCLUDE_STATUSES,
  NEWS_WIRE_PAGE_SIZE,
  type NewsWireDbRow,
  type NewsWireItem,
  type NewsWireLocale,
} from "@/lib/news-wire/types";
import {
  displayWireTitle,
  isWireTitlesReady,
  sanitizeWireOutboundUrl,
} from "@/lib/news-wire/wireTitles";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";
import { formatAmericaNewYorkDateKey } from "@/lib/cron/americaNewYork";
import { startOfNyDateKeyMs } from "@/lib/home/nyEditionTime";

function isMissingWireColumn(error: {
  code?: string;
  message?: string;
  details?: string;
}): boolean {
  const blob = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
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
  return blob.includes("collection_candidates") && blob.includes("does not exist");
}

function toPublicItem(
  row: NewsWireDbRow,
  locale: NewsWireLocale
): NewsWireItem | null {
  if (!isWireTitlesReady(row)) return null;
  const originalUrl = sanitizeWireOutboundUrl(row.original_url);
  if (!originalUrl) return null;

  const baseLabel =
    getArticleSourceLabel({
      source: row.source,
      original_url: row.original_url,
    }) ||
    row.feed_label?.trim() ||
    row.source;
  const sourceLabel = localizeSourceLabel(baseLabel, locale, row.source);
  const title = displayWireTitle(row, locale);
  if (!title) return null;

  return {
    id: row.id,
    title,
    sourceKey: row.source,
    sourceLabel,
    publishedAt: row.rss_published_at,
    collectedAt: row.created_at,
    originalUrl,
    aiRecommendGrade: parseWireGrade(row.ai_recommend_grade),
    aiRecommendScore:
      typeof row.ai_recommend_score === "number" ? row.ai_recommend_score : null,
  };
}

/**
 * Exclude candidates whose linked article is already live/public editorial.
 * Keep enrich_failed even if article_id is set (partial failure).
 */
async function filterDuplicateLiveArticles(
  client: ReturnType<typeof createServiceRoleSupabaseClient>["client"],
  rows: NewsWireDbRow[]
): Promise<NewsWireDbRow[]> {
  const linked = rows.filter(
    (r) => r.article_id && r.status !== "enrich_failed"
  );
  if (linked.length === 0) return rows;

  const articleIds = [...new Set(linked.map((r) => r.article_id!).filter(Boolean))];
  const { data, error } = await client
    .from("articles")
    .select("id, is_published, status")
    .in("id", articleIds);
  if (error || !data) return rows;

  const hide = new Set<string>();
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

  return rows.filter(
    (r) =>
      !(
        r.article_id &&
        r.status !== "enrich_failed" &&
        hide.has(r.article_id)
      )
  );
}

async function fetchWireRows(options: {
  sinceIso: string | null;
  limit: number;
  offset?: number;
}): Promise<{ rows: NewsWireDbRow[]; schemaReady: boolean; error: string | null }> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { rows: [], schemaReady: false, error: envCheck.error };
  }

  try {
    const { client } = createServiceRoleSupabaseClient();
    let query = client
      .from("collection_candidates")
      .select(NEWS_WIRE_DB_SELECT)
      .in("status", NEWS_WIRE_INCLUDE_STATUSES)
      .order("created_at", { ascending: false })
      .range(
        options.offset ?? 0,
        (options.offset ?? 0) + Math.max(0, options.limit - 1)
      );

    if (options.sinceIso) {
      query = query.gte("created_at", options.sinceIso);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingWireColumn(error) || isMissingRelation(error)) {
        return { rows: [], schemaReady: false, error: null };
      }
      return { rows: [], schemaReady: true, error: error.message };
    }

    const filtered = await filterDuplicateLiveArticles(
      client,
      (data ?? []) as unknown as NewsWireDbRow[]
    );
    return { rows: filtered, schemaReady: true, error: null };
  } catch (err) {
    return {
      rows: [],
      schemaReady: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function sortAndMap(
  rows: NewsWireDbRow[],
  locale: NewsWireLocale,
  nowMs: number,
  limit: number
): NewsWireItem[] {
  const items: NewsWireItem[] = [];
  for (const row of rows) {
    const item = toPublicItem(row, locale);
    if (item) items.push(item);
  }
  items.sort((a, b) => compareNewsWireItems(a, b, nowMs));
  return items.slice(0, limit);
}

/** Locale-neutral id order from the same ranked list (titles must be ready). */
export function newsWireIdOrder(items: NewsWireItem[]): string[] {
  return items.map((i) => i.id);
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

  // Over-fetch then filter ready + rank (no carryover beyond 24h window).
  const { rows, schemaReady, error } = await fetchWireRows({
    sinceIso,
    limit: 80,
  });
  if (!schemaReady) {
    return { items: [], schemaReady: false, error: null };
  }
  if (error) return { items: [], schemaReady: true, error };

  return {
    items: sortAndMap(rows, locale, nowMs, NEWS_WIRE_HOME_LIMIT),
    schemaReady: true,
    error: null,
  };
}

export type NewsWireDayPage = {
  items: NewsWireItem[];
  dateKey: string;
  page: number;
  pageSize: number;
  hasMore: boolean;
  schemaReady: boolean;
  error: string | null;
};

/** America/New_York calendar day bounds as UTC ISO. */
export function nyDateKeyBounds(
  dateKey: string
): { startIso: string; endIso: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const startMs = startOfNyDateKeyMs(dateKey);
  if (!Number.isFinite(startMs)) return null;
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

export function todayNyDateKey(nowMs = Date.now()): string {
  return formatAmericaNewYorkDateKey(new Date(nowMs));
}

export async function fetchNewsWireDayPage(options: {
  locale: NewsWireLocale;
  dateKey: string;
  page?: number;
  nowMs?: number;
}): Promise<NewsWireDayPage> {
  const page = Math.max(1, options.page ?? 1);
  const bounds = nyDateKeyBounds(options.dateKey);
  if (!bounds) {
    return {
      items: [],
      dateKey: options.dateKey,
      page,
      pageSize: NEWS_WIRE_PAGE_SIZE,
      hasMore: false,
      schemaReady: true,
      error: "invalid_date",
    };
  }

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return {
      items: [],
      dateKey: options.dateKey,
      page,
      pageSize: NEWS_WIRE_PAGE_SIZE,
      hasMore: false,
      schemaReady: false,
      error: null,
    };
  }

  try {
    const { client } = createServiceRoleSupabaseClient();
    const from = (page - 1) * NEWS_WIRE_PAGE_SIZE;
    const to = from + NEWS_WIRE_PAGE_SIZE; // fetch one extra for hasMore

    const { data, error } = await client
      .from("collection_candidates")
      .select(NEWS_WIRE_DB_SELECT)
      .in("status", NEWS_WIRE_INCLUDE_STATUSES)
      .gte("created_at", bounds.startIso)
      .lt("created_at", bounds.endIso)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      if (isMissingWireColumn(error) || isMissingRelation(error)) {
        return {
          items: [],
          dateKey: options.dateKey,
          page,
          pageSize: NEWS_WIRE_PAGE_SIZE,
          hasMore: false,
          schemaReady: false,
          error: null,
        };
      }
      return {
        items: [],
        dateKey: options.dateKey,
        page,
        pageSize: NEWS_WIRE_PAGE_SIZE,
        hasMore: false,
        schemaReady: true,
        error: error.message,
      };
    }

    const filtered = await filterDuplicateLiveArticles(
      client,
      (data ?? []) as unknown as NewsWireDbRow[]
    );
    const nowMs = options.nowMs ?? Date.now();
    const mapped = sortAndMap(
      filtered,
      options.locale,
      nowMs,
      NEWS_WIRE_PAGE_SIZE + 1
    );
    const hasMore = mapped.length > NEWS_WIRE_PAGE_SIZE;
    return {
      items: mapped.slice(0, NEWS_WIRE_PAGE_SIZE),
      dateKey: options.dateKey,
      page,
      pageSize: NEWS_WIRE_PAGE_SIZE,
      hasMore,
      schemaReady: true,
      error: null,
    };
  } catch (err) {
    return {
      items: [],
      dateKey: options.dateKey,
      page,
      pageSize: NEWS_WIRE_PAGE_SIZE,
      hasMore: false,
      schemaReady: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
