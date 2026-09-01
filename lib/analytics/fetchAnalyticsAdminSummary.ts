import "server-only";

import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";
import { isAnalyticsSchemaMissing } from "./types";

export type AnalyticsArticleStat = {
  articleId: string;
  count: number;
  koTitle: string | null;
  enTitle: string | null;
  koSlug: string | null;
  enSlug: string | null;
  source: string | null;
};

export type AnalyticsKeyStat = {
  key: string;
  count: number;
};

export type AnalyticsSearchStat = {
  query: string;
  count: number;
};

export type AnalyticsReferrerStat = {
  domain: string;
  count: number;
};

export type AnalyticsAdminSummary = {
  pageViews: number;
  sessions: number;
  articleViews: number;
  articleClicks: number;
  homeArticleClicks: number;
  relatedArticleClicks: number;
  searchResultClicks: number;
  searchSubmits: number;
  sourceFilterClicks: number;
  categoryFilterClicks: number;
  languageSwitches: number;
  koEvents: number;
  enEvents: number;
  mobileEvents: number;
  desktopEvents: number;
  topViewedArticles: AnalyticsArticleStat[];
  topClickedArticles: AnalyticsArticleStat[];
  topSources: AnalyticsKeyStat[];
  topCategories: AnalyticsKeyStat[];
  topSearchQueries: AnalyticsSearchStat[];
  topReferrers: AnalyticsReferrerStat[];
};

type RpcRow = {
  article_id?: string;
  source_key?: string;
  category_key?: string;
  query?: string;
  domain?: string;
  count?: number;
};

type RpcSummary = {
  page_views?: number;
  sessions?: number;
  article_views?: number;
  article_clicks?: number;
  home_article_clicks?: number;
  related_article_clicks?: number;
  search_result_clicks?: number;
  search_submits?: number;
  source_filter_clicks?: number;
  category_filter_clicks?: number;
  language_switches?: number;
  ko_events?: number;
  en_events?: number;
  mobile_events?: number;
  desktop_events?: number;
  top_viewed_articles?: RpcRow[];
  top_clicked_articles?: RpcRow[];
  top_sources?: RpcRow[];
  top_categories?: RpcRow[];
  top_search_queries?: RpcRow[];
  top_referrers?: RpcRow[];
};

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return Number(value) || 0;
  return 0;
}

async function enrichArticleStats(
  rows: RpcRow[]
): Promise<AnalyticsArticleStat[]> {
  const articleIds = rows
    .map((row) => row.article_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (articleIds.length === 0) {
    return rows.map((row) => ({
      articleId: row.article_id ?? "unknown",
      count: num(row.count),
      koTitle: null,
      enTitle: null,
      koSlug: null,
      enSlug: null,
      source: null,
    }));
  }

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return rows.map((row) => ({
      articleId: row.article_id ?? "unknown",
      count: num(row.count),
      koTitle: null,
      enTitle: null,
      koSlug: null,
      enSlug: null,
      source: null,
    }));
  }

  const { client } = createServiceRoleSupabaseClient();
  const [{ data: localizations }, { data: articles }] = await Promise.all([
    client
      .from("article_localizations")
      .select("article_id, locale, title, slug")
      .in("article_id", articleIds),
    client.from("articles").select("id, source").in("id", articleIds),
  ]);

  const locByArticle = new Map<
    string,
    { ko?: { title: string; slug: string }; en?: { title: string; slug: string } }
  >();
  for (const row of localizations ?? []) {
    const articleId = String(row.article_id);
    const entry = locByArticle.get(articleId) ?? {};
    if (row.locale === "ko") {
      entry.ko = { title: row.title, slug: row.slug };
    } else if (row.locale === "en") {
      entry.en = { title: row.title, slug: row.slug };
    }
    locByArticle.set(articleId, entry);
  }

  const sourceByArticle = new Map<string, string>();
  for (const row of articles ?? []) {
    sourceByArticle.set(String(row.id), row.source ?? "");
  }

  return rows.map((row) => {
    const articleId = row.article_id ?? "unknown";
    const loc = locByArticle.get(articleId);
    return {
      articleId,
      count: num(row.count),
      koTitle: loc?.ko?.title ?? null,
      enTitle: loc?.en?.title ?? null,
      koSlug: loc?.ko?.slug ?? null,
      enSlug: loc?.en?.slug ?? null,
      source: sourceByArticle.get(articleId) ?? null,
    };
  });
}

function mapSummary(raw: RpcSummary): AnalyticsAdminSummary {
  return {
    pageViews: num(raw.page_views),
    sessions: num(raw.sessions),
    articleViews: num(raw.article_views),
    articleClicks: num(raw.article_clicks),
    homeArticleClicks: num(raw.home_article_clicks),
    relatedArticleClicks: num(raw.related_article_clicks),
    searchResultClicks: num(raw.search_result_clicks),
    searchSubmits: num(raw.search_submits),
    sourceFilterClicks: num(raw.source_filter_clicks),
    categoryFilterClicks: num(raw.category_filter_clicks),
    languageSwitches: num(raw.language_switches),
    koEvents: num(raw.ko_events),
    enEvents: num(raw.en_events),
    mobileEvents: num(raw.mobile_events),
    desktopEvents: num(raw.desktop_events),
    topViewedArticles: [],
    topClickedArticles: [],
    topSources: (raw.top_sources ?? []).map((row) => ({
      key: row.source_key ?? "unknown",
      count: num(row.count),
    })),
    topCategories: (raw.top_categories ?? []).map((row) => ({
      key: row.category_key ?? "unknown",
      count: num(row.count),
    })),
    topSearchQueries: (raw.top_search_queries ?? []).map((row) => ({
      query: row.query ?? "",
      count: num(row.count),
    })),
    topReferrers: (raw.top_referrers ?? []).map((row) => ({
      domain: row.domain ?? "unknown",
      count: num(row.count),
    })),
  };
}

export async function fetchAnalyticsAdminSummary(
  days: 1 | 7 | 30
): Promise<
  | { ready: false; error: string }
  | { ready: true; summary: AnalyticsAdminSummary }
> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ready: false, error: envCheck.error };
  }

  const { client } = createServiceRoleSupabaseClient();
  const { data, error } = await client.rpc("analytics_admin_summary", {
    p_days: days,
  });

  if (error) {
    if (isAnalyticsSchemaMissing(error)) {
      return { ready: false, error: "schema_not_ready" };
    }
    return { ready: false, error: error.message };
  }

  const raw = (data ?? {}) as RpcSummary;
  const summary = mapSummary(raw);
  summary.topViewedArticles = await enrichArticleStats(raw.top_viewed_articles ?? []);
  summary.topClickedArticles = await enrichArticleStats(raw.top_clicked_articles ?? []);

  return { ready: true, summary };
}
