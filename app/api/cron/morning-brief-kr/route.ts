import { NextRequest } from "next/server";

import { runRegionalMorningBriefCron } from "@/lib/cron/runRegionalMorningBriefCron";
import { COLLECT_REGION_KOREA } from "@/lib/rss/collectRegions";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Evening Discord brief (Korea) — 20:15 America/New_York. No article create/publish. */
export async function GET(request: NextRequest) {
  return runRegionalMorningBriefCron(request, COLLECT_REGION_KOREA);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
