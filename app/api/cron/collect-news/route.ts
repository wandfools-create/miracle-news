import { NextRequest, NextResponse } from "next/server";

import { collectRssToReviewQueue } from "@/lib/rss/collectRssToReviewQueue";
import { resolveCollectRssOptions } from "@/lib/rss/rssCollectConfig";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const cronHeader = request.headers.get("x-cron-secret");
  if (cronHeader === secret) return true;

  return false;
}

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
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  return runCollect(request);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
