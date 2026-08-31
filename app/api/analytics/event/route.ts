import { NextResponse } from "next/server";
import { recordAnalyticsEvent } from "@/lib/analytics/recordAnalyticsEvent";
import { isAllowedAnalyticsEvent } from "@/lib/analytics/types";

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
  deviceClass?: "mobile" | "desktop";
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const eventName = String(body.eventName ?? "").trim();
  if (!isAllowedAnalyticsEvent(eventName)) {
    return NextResponse.json({ ok: false, error: "event_not_allowed" }, { status: 400 });
  }

  const result = await recordAnalyticsEvent({
    eventName,
    sessionId: String(body.sessionId ?? ""),
    locale: body.locale,
    path: body.path,
    articleId: body.articleId,
    sourceKey: body.sourceKey,
    categoryKey: body.categoryKey,
    searchQuery: body.searchQuery,
    referrerDomain: body.referrerDomain,
    deviceClass: body.deviceClass,
  });

  if (!result.ok) {
    const status = result.error === "rate_limited" ? 429 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json({ ok: true });
}
