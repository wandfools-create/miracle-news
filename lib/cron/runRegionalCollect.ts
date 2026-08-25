import type { NextRequest } from "next/server";

import { collectRssToReviewQueue } from "@/lib/rss/collectRssToReviewQueue";
import type { CollectRssResult } from "@/lib/rss/collectRssToReviewQueue";
import type { CollectRegion } from "@/lib/rss/collectRegions";
import { resolveCollectRssOptionsForRegion } from "@/lib/rss/rssCollectConfig";

/** Core regional RSS collect (candidates only, no OpenAI). */
export async function runRegionalCollect(
  region: CollectRegion,
  searchParams?: URLSearchParams | null
): Promise<CollectRssResult> {
  const options = resolveCollectRssOptionsForRegion(region, searchParams);
  return collectRssToReviewQueue(options);
}

export function collectHintFromResult(result: CollectRssResult): string | undefined {
  if (result.testMode) return "Test mode: counts only, no DB writes.";
  if (result.dryRun) {
    return "Dry-run: no candidates saved. Set RSS_COLLECT_SAVE=1 on Vercel Production.";
  }
  return undefined;
}

export function collectJsonFromResult(
  result: CollectRssResult,
  region: CollectRegion
) {
  return {
    ok: result.ok,
    skipped: false,
    region,
    mode: result.mode,
    save: result.save,
    testMode: result.testMode,
    dryRun: result.dryRun,
    maxCandidatesPerRun: result.maxCandidatesPerRun,
    openaiCalled: false,
    costs: result.costs,
    totals: result.totals,
    feeds: result.feeds,
    hint: collectHintFromResult(result),
  };
}

export function readForceOrDryRun(request: NextRequest) {
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  return { dryRun, searchParams: request.nextUrl.searchParams };
}
