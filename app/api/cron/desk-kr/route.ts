import { NextRequest } from "next/server";

import { runRegionalDeskOrchestrator } from "@/lib/cron/runRegionalDeskOrchestrator";
import { COLLECT_REGION_KOREA } from "@/lib/rss/collectRegions";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Korea desk orchestrator (Hobby cron #2).
 * Collects every six hours. AI recommend + Discord only run at 00:00 UTC,
 * unless a manual POST/forceBrief request explicitly asks for a full run.
 */
export async function GET(request: NextRequest) {
  return runRegionalDeskOrchestrator(request, COLLECT_REGION_KOREA);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
