import { NextRequest } from "next/server";

import { runRegionalDeskOrchestrator } from "@/lib/cron/runRegionalDeskOrchestrator";
import { COLLECT_REGION_KOREA } from "@/lib/rss/collectRegions";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Korea desk orchestrator (Hobby cron #2).
 * collect → AI recommend → Discord brief. Fixed UTC; ±1h ET across DST OK.
 */
export async function GET(request: NextRequest) {
  return runRegionalDeskOrchestrator(request, COLLECT_REGION_KOREA);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
