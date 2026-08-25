import { NextRequest, NextResponse } from "next/server";

import {
  cronSecretMissingResponse,
  cronUnauthorizedResponse,
  isCronAuthorized,
} from "@/lib/cron/cronAuth";
import { collectRssToReviewQueue } from "@/lib/rss/collectRssToReviewQueue";
import { resolveCollectRssOptions } from "@/lib/rss/rssCollectConfig";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Legacy manual/compat collect endpoint.
 * Prefer /api/cron/collect-news-us and /api/cron/collect-news-kr for Production crons.
 * Pass ?region=us-intl|korea for a regional run (no ET hour gate).
 */
async function runCollect(request: NextRequest) {
  const options = resolveCollectRssOptions(request.nextUrl.searchParams);
  const result = await collectRssToReviewQueue(options);

  const hint = result.testMode
    ? "Test mode: counts only, no DB writes."
    : result.dryRun
      ? "Dry-run: no candidates saved. Set RSS_COLLECT_SAVE=1 on Vercel Production."
      : undefined;

  return NextResponse.json({
    ok: result.ok,
    region: options.region,
    mode: result.mode,
    save: result.save,
    testMode: result.testMode,
    dryRun: result.dryRun,
    maxCandidatesPerRun: result.maxCandidatesPerRun,
    openaiCalled: false,
    costs: result.costs,
    totals: result.totals,
    feeds: result.feeds,
    hint,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  });
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET?.trim()) {
    return cronSecretMissingResponse();
  }

  if (!isCronAuthorized(request)) {
    return cronUnauthorizedResponse();
  }

  return runCollect(request);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
