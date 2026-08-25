import { NextRequest, NextResponse } from "next/server";

import {
  cronSecretMissingResponse,
  cronUnauthorizedResponse,
  isCronAuthorized,
} from "@/lib/cron/cronAuth";
import {
  collectJsonFromResult,
  runRegionalCollect,
} from "@/lib/cron/runRegionalCollect";
import type { CollectRegion } from "@/lib/rss/collectRegions";

/**
 * Manual/compat regional RSS collect (not registered in vercel.json).
 * OpenAI is never called; candidates only.
 */
export async function runRegionalCollectCron(
  request: NextRequest,
  region: CollectRegion
): Promise<NextResponse> {
  if (!process.env.CRON_SECRET?.trim()) {
    return cronSecretMissingResponse();
  }
  if (!isCronAuthorized(request)) {
    return cronUnauthorizedResponse();
  }

  const result = await runRegionalCollect(
    region,
    request.nextUrl.searchParams
  );

  return NextResponse.json({
    ...collectJsonFromResult(result, region),
    vercelEnv: process.env.VERCEL_ENV ?? null,
  });
}
