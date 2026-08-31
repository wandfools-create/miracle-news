import "server-only";

import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";
import {
  hashSearchQuery,
  isAllowedAnalyticsEvent,
  sanitizeReferrerDomain,
  sanitizeSearchQuery,
  type AnalyticsEventPayload,
} from "./types";

const rateLimit = new Map<string, number>();
const RATE_LIMIT_MS = 300;

export async function recordAnalyticsEvent(
  payload: AnalyticsEventPayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAllowedAnalyticsEvent(payload.eventName)) {
    return { ok: false, error: "event_not_allowed" };
  }

  const sessionId = payload.sessionId.trim().slice(0, 64);
  if (!sessionId) return { ok: false, error: "missing_session" };

  const key = `${sessionId}:${payload.eventName}`;
  const now = Date.now();
  const last = rateLimit.get(key) ?? 0;
  if (now - last < RATE_LIMIT_MS) {
    return { ok: false, error: "rate_limited" };
  }
  rateLimit.set(key, now);

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error };
  }

  const search = sanitizeSearchQuery(payload.searchQuery);
  const searchHash = search ? hashSearchQuery(search) : null;

  const { client } = createServiceRoleSupabaseClient();
  const { error } = await client.from("analytics_events").insert({
    event_name: payload.eventName,
    session_id: sessionId,
    locale: payload.locale?.slice(0, 8) ?? null,
    path: payload.path?.slice(0, 500) ?? null,
    article_id: payload.articleId ?? null,
    source_key: payload.sourceKey?.slice(0, 80) ?? null,
    category_key: payload.categoryKey?.slice(0, 80) ?? null,
    search_query_hash: searchHash,
    referrer_domain: sanitizeReferrerDomain(payload.referrerDomain),
    device_class: payload.deviceClass ?? null,
    metadata: {},
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type AnalyticsSummary = {
  sessions: number;
  pageViews: number;
  articleViews: number;
  articleClicks: number;
  koEvents: number;
  enEvents: number;
  topArticles: Array<{ articleId: string; views: number }>;
  topReferrers: Array<{ domain: string; count: number }>;
};

export async function fetchAnalyticsSummary(
  days: 1 | 7 | 30
): Promise<{ summary: AnalyticsSummary | null; error: string | null }> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { summary: null, error: envCheck.error };
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { client } = createServiceRoleSupabaseClient();
  const { data, error } = await client
    .from("analytics_events")
    .select("event_name, session_id, locale, article_id, referrer_domain")
    .gte("created_at", since)
    .limit(5000);

  if (error) return { summary: null, error: error.message };

  const rows = data ?? [];
  const sessions = new Set(rows.map((r) => r.session_id as string)).size;
  const pageViews = rows.filter((r) => r.event_name === "page_view").length;
  const articleViews = rows.filter((r) => r.event_name === "article_view").length;
  const articleClicks = rows.filter((r) => r.event_name === "article_click").length;
  const koEvents = rows.filter((r) => r.locale === "ko").length;
  const enEvents = rows.filter((r) => r.locale === "en").length;

  const articleCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.event_name !== "article_view" || !row.article_id) continue;
    const id = String(row.article_id);
    articleCounts.set(id, (articleCounts.get(id) ?? 0) + 1);
  }
  const topArticles = [...articleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([articleId, views]) => ({ articleId, views }));

  const refCounts = new Map<string, number>();
  for (const row of rows) {
    const domain = row.referrer_domain as string | null;
    if (!domain) continue;
    refCounts.set(domain, (refCounts.get(domain) ?? 0) + 1);
  }
  const topReferrers = [...refCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([domain, count]) => ({ domain, count }));

  return {
    summary: {
      sessions,
      pageViews,
      articleViews,
      articleClicks,
      koEvents,
      enEvents,
      topArticles,
      topReferrers,
    },
    error: null,
  };
}