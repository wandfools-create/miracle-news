import { NextResponse } from "next/server";
import { recordAnalyticsEvent } from "@/lib/analytics/recordAnalyticsEvent";
import {
  ANALYTICS_MAX_BODY_BYTES,
  isAllowedAnalyticsEvent,
  isAnalyticsLocale,
  isValidUuid,
  sanitizeAnalyticsKey,
  sanitizeAnalyticsPath,
  sanitizeDeviceClass,
  sanitizeReferrerDomain,
  sanitizeSearchQuery,
  sanitizeSessionId,
} from "@/lib/analytics/types";

export const runtime = "nodejs";

type Body = {
  eventName?: string;
  sessionId?: string;
  locale?: string;
  path?: string;
  articleId?: string;
  sourceKey?: string;
  categoryKey?: string;
  searchQuery?: string;
  referrerDomain?: string;
  deviceClass?: string;
};

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > ANALYTICS_MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 400 });
  }

  const rawBody = await request.text();
  if (rawBody.length > ANALYTICS_MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 400 });
  }

  let body: Body;
  try {
    body = JSON.parse(rawBody) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const eventName = String(body.eventName ?? "").trim();
  if (!isAllowedAnalyticsEvent(eventName)) {
    return NextResponse.json({ ok: false, error: "event_not_allowed" }, { status: 400 });
  }

  const sessionId = sanitizeSessionId(String(body.sessionId ?? ""));
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "missing_session" }, { status: 400 });
  }

  const locale = isAnalyticsLocale(body.locale) ? body.locale : null;
  const path = sanitizeAnalyticsPath(body.path ?? null);
  if (body.path && !path) {
    return NextResponse.json({ ok: false, error: "invalid_path" }, { status: 400 });
  }

  let articleId: string | undefined;
  if (body.articleId) {
    if (!isValidUuid(body.articleId)) {
      return NextResponse.json({ ok: false, error: "invalid_article_id" }, { status: 400 });
    }
    articleId = body.articleId.trim();
  }

  const sourceKey = sanitizeAnalyticsKey(body.sourceKey);
  const categoryKey = sanitizeAnalyticsKey(body.categoryKey);
  const searchQuery =
    eventName === "search_submit" ? sanitizeSearchQuery(body.searchQuery) : undefined;

  if (eventName === "search_submit" && body.searchQuery && !searchQuery) {
    return NextResponse.json({ ok: false, error: "invalid_search_query" }, { status: 400 });
  }

  const result = await recordAnalyticsEvent({
    eventName,
    sessionId,
    locale,
    path,
    articleId,
    sourceKey,
    categoryKey,
    searchQuery,
    referrerDomain: sanitizeReferrerDomain(body.referrerDomain),
    deviceClass: sanitizeDeviceClass(body.deviceClass),
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json({ ok: true, deduped: result.deduped ?? false });
}
