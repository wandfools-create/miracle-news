import {
  DESK_KR_BRIEF_HOUR_UTC,
  DESK_US_BRIEF_HOUR_UTC,
} from "@/lib/cron/americaNewYork";
import { isEditorialDiscordEnabled } from "@/lib/discord/editorialDiscordPolicy";
import type { CollectRegion } from "@/lib/rss/collectRegions";

export type RegionalDeskRunPlan = {
  collect: true;
  runBrief: boolean;
  reason:
    | "scheduled_brief_slot"
    | "scheduled_collect_only"
    | "manual_post"
    | "forced_brief"
    | "forced_collect_only";
};

export function briefHourUtcForRegion(region: CollectRegion): number {
  return region === "korea"
    ? DESK_KR_BRIEF_HOUR_UTC
    : DESK_US_BRIEF_HOUR_UTC;
}

export function isRegionalBriefDue(
  region: CollectRegion,
  now: Date = new Date()
): boolean {
  return now.getUTCHours() === briefHourUtcForRegion(region);
}

/**
 * Scheduled GETs collect every time and brief only at the original desk slot.
 * Manual POSTs preserve the previous full-desk behavior. Query flags are useful
 * for safe operations and tests; collectOnly always wins.
 */
export function resolveRegionalDeskRunPlan(input: {
  region: CollectRegion;
  method?: string | null;
  searchParams?: URLSearchParams | null;
  now?: Date;
}): RegionalDeskRunPlan {
  const editorialDiscord = isEditorialDiscordEnabled();

  if (input.searchParams?.get("collectOnly") === "1") {
    return { collect: true, runBrief: false, reason: "forced_collect_only" };
  }
  if (!editorialDiscord) {
    return { collect: true, runBrief: false, reason: "scheduled_collect_only" };
  }
  if (input.searchParams?.get("forceBrief") === "1") {
    return { collect: true, runBrief: true, reason: "forced_brief" };
  }
  if (input.method?.toUpperCase() === "POST") {
    return { collect: true, runBrief: true, reason: "manual_post" };
  }
  if (isRegionalBriefDue(input.region, input.now)) {
    return { collect: true, runBrief: true, reason: "scheduled_brief_slot" };
  }
  return { collect: true, runBrief: false, reason: "scheduled_collect_only" };
}
