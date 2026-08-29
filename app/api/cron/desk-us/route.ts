import { NextRequest } from "next/server";

import { runRegionalDeskOrchestrator } from "@/lib/cron/runRegionalDeskOrchestrator";
import { COLLECT_REGION_US_INTL } from "@/lib/rss/collectRegions";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * US·international desk orchestrator (Hobby cron #1).
 * Collects every six hours. AI recommend + Discord only run at 12:00 UTC,
 * unless a manual POST/forceBrief request explicitly asks for a full run.
 */
export async function GET(request: NextRequest) {
  return runRegionalDeskOrchestrator(request, COLLECT_REGION_US_INTL);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
