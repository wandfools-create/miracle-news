import "server-only";

import { createHash } from "node:crypto";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";
import {
  buildAnalyticsDedupeKey,
  isAllowedAnalyticsEvent,
  isAnalyticsLocale,
  isValidUuid,
  sanitizeAnalyticsKey,
  sanitizeAnalyticsPath,
  sanitizeDeviceClass,
  sanitizeReferrerDomain,
  sanitizeSearchQuery,
  sanitizeSessionId,
  type AnalyticsEventPayload,
} from "./types";

function hashDedupeKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export type RecordAnalyticsResult =
  | { ok: true; deduped?: boolean }
  | { ok: false; error: string };

export async function recordAnalyticsEvent(
  payload: AnalyticsEventPayload
): Promise<RecordAnalyticsResult> {
  if (!isAllowedAnalyticsEvent(payload.eventName)) {
    return { ok: false, error: "event_not_allowed" };
  }

  const sessionId = sanitizeSessionId(payload.sessionId);
  if (!sessionId) return { ok: false, error: "missing_session" };

  const path = sanitizeAnalyticsPath(payload.path);
  if (payload.path && !path) {
    return { ok: false, error: "invalid_path" };
  }

  const locale = isAnalyticsLocale(payload.locale ?? null) ? payload.locale : null;

  let articleId: string | null = null;
  if (payload.articleId) {
    if (!isValidUuid(payload.articleId)) {
      return { ok: false, error: "invalid_article_id" };
    }
    articleId = payload.articleId.trim();
  }

  const sourceKey = sanitizeAnalyticsKey(payload.sourceKey);
  const categoryKey = sanitizeAnalyticsKey(payload.categoryKey);
  const searchQuery =
    payload.eventName === "search_submit"
      ? sanitizeSearchQuery(payload.searchQuery)
      : null;

  if (payload.eventName === "search_submit" && payload.searchQuery && !searchQuery) {
    return { ok: false, error: "invalid_search_query" };
  }

  const dedupeRaw = buildAnalyticsDedupeKey({
    sessionId,
    eventName: payload.eventName,
    articleId,
    path,
    sourceKey,
    categoryKey,
    searchQuery,
  });
  const dedupeKey = hashDedupeKey(dedupeRaw);

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error };
  }

  const { client } = createServiceRoleSupabaseClient();
  const { error } = await client.from("analytics_events").insert({
    event_name: payload.eventName,
    session_id: sessionId,
    locale,
    path,
    article_id: articleId,
    source_key: sourceKey,
    category_key: categoryKey,
    search_query: searchQuery,
    referrer_domain: sanitizeReferrerDomain(payload.referrerDomain),
    device_class: sanitizeDeviceClass(payload.deviceClass),
    dedupe_key: dedupeKey,
  });

  if (!error) return { ok: true };

  if (error.code === "23505") {
    return { ok: true, deduped: true };
  }

  return { ok: false, error: error.message };
}
