import { NextRequest } from "next/server";

import { runRegionalCollectCron } from "@/lib/cron/runRegionalCollectCron";
import { COLLECT_REGION_KOREA } from "@/lib/rss/collectRegions";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Korea RSS collect — 20:00 America/New_York (DST-safe dual UTC). */
export async function GET(request: NextRequest) {
  return runRegionalCollectCron(request, COLLECT_REGION_KOREA);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
