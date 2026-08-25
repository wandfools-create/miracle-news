import { NextRequest, NextResponse } from "next/server";

import {
  cronSecretMissingResponse,
  cronUnauthorizedResponse,
  isCronAuthorized,
} from "@/lib/cron/cronAuth";
import { runMorningBriefCron } from "@/lib/discord/runMorningBrief";
import type { CollectRegion } from "@/lib/rss/collectRegions";

/**
 * Manual/compat regional Morning Brief (not registered in vercel.json).
 * Does not create or publish articles — recommend + Discord shortlist only.
 */
export async function runRegionalMorningBriefCron(
  request: NextRequest,
  region: CollectRegion
): Promise<NextResponse> {
  if (!process.env.CRON_SECRET?.trim()) {
    return cronSecretMissingResponse();
  }
  if (!isCronAuthorized(request)) {
    return cronUnauthorizedResponse();
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const result = await runMorningBriefCron({ dryRun, region });

  return NextResponse.json({
    ok: result.ok,
    skipped: false,
    region,
    sent: result.sent,
    skippedItems: result.skipped,
    dryRun: result.dryRun ?? false,
    recommend: result.recommend
      ? {
          ok: result.recommend.ok,
          updated: result.recommend.ok ? result.recommend.updated : null,
          openaiCalls: result.recommend.openaiCalls,
        }
      : null,
    errors: result.errors,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  });
}
