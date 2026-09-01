import { NextResponse } from "next/server";
import { recordAnalyticsEvent } from "@/lib/analytics/recordAnalyticsEvent";
import {
  publicAnalyticsHttpStatus,
  type PublicAnalyticsErrorCode,
} from "@/lib/analytics/publicErrors";
import { validateAnalyticsOrigin } from "@/lib/analytics/validateAnalyticsOrigin";
import {
  ANALYTICS_MAX_BODY_BYTES,
  isAllowedAnalyticsEvent,
  isAnalyticsLocale,
  isValidUuid,
  normalizeAnalyticsHost,
  sanitizeAnalyticsKey,
  sanitizeAnalyticsPath,
  sanitizeDeviceClass,
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

function publicErrorResponse(error: PublicAnalyticsErrorCode) {
  return NextResponse.json({ ok: false, error }, { status: publicAnalyticsHttpStatus(error) });
}

export async function POST(request: Request) {
  const originCheck = validateAnalyticsOrigin(request);
  if (!originCheck.ok) {
    return publicErrorResponse(originCheck.error);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > ANALYTICS_MAX_BODY_BYTES) {
    return publicErrorResponse("payload_too_large");
  }

  const rawBody = await request.text();
  if (rawBody.length > ANALYTICS_MAX_BODY_BYTES) {
    return publicErrorResponse("payload_too_large");
  }

  let body: Body;
  try {
    body = JSON.parse(rawBody) as Body;
  } catch {
    return publicErrorResponse("invalid_json");
  }

  const eventName = String(body.eventName ?? "").trim();
  if (!isAllowedAnalyticsEvent(eventName)) {
    return publicErrorResponse("event_not_allowed");
  }

  const sessionId = sanitizeSessionId(String(body.sessionId ?? ""));
  if (!sessionId) {
    return publicErrorResponse("missing_session");
  }

  const locale = isAnalyticsLocale(body.locale) ? body.locale : null;
  const path = sanitizeAnalyticsPath(body.path ?? null);
  if (body.path && !path) {
    return publicErrorResponse("invalid_path");
  }

  let articleId: string | undefined;
  if (body.articleId) {
    if (!isValidUuid(body.articleId)) {
      return publicErrorResponse("invalid_article_id");
    }
    articleId = body.articleId.trim();
  }

  const sourceKey = sanitizeAnalyticsKey(body.sourceKey);
  const categoryKey = sanitizeAnalyticsKey(body.categoryKey);
  const searchQuery =
    eventName === "search_submit" ? sanitizeSearchQuery(body.searchQuery) : undefined;

  if (eventName === "search_submit" && body.searchQuery && !searchQuery) {
    return publicErrorResponse("invalid_search_query");
  }

  const result = await recordAnalyticsEvent(
    {
      eventName,
      sessionId,
      locale,
      path,
      articleId,
      sourceKey,
      categoryKey,
      searchQuery,
      referrerDomain: body.referrerDomain ?? null,
      deviceClass: sanitizeDeviceClass(body.deviceClass),
    },
    { requestHost: normalizeAnalyticsHost(request.headers.get("host")) }
  );

  if (!result.ok) {
    return publicErrorResponse(result.error);
  }

  return NextResponse.json({ ok: true, deduped: result.deduped ?? false });
}
