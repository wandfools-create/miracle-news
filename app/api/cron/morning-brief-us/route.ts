import { NextRequest } from "next/server";

import { runRegionalMorningBriefCron } from "@/lib/cron/runRegionalMorningBriefCron";
import { COLLECT_REGION_US_INTL } from "@/lib/rss/collectRegions";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Morning Discord brief (US·intl) — 08:15 America/New_York. No article create/publish. */
export async function GET(request: NextRequest) {
  return runRegionalMorningBriefCron(request, COLLECT_REGION_US_INTL);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
