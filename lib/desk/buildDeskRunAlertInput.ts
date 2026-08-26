import type { DeskRunAlertInput } from "@/lib/desk/deskAlertTypes";
import type {
  DeskStepCollect,
  DeskStepDiscord,
  DeskStepRecommend,
} from "@/lib/cron/runRegionalDeskOrchestrator";
import type { CollectRegion } from "@/lib/rss/collectRegions";

function isCollectStepFailure(
  collect: DeskStepCollect
): collect is { ok: false; error: string; region: CollectRegion } {
  return collect.ok === false && !("feeds" in collect);
}

/** Map orchestrator step results into alert analyzer input. */
export function buildDeskRunAlertInput(input: {
  region: CollectRegion;
  dryRun: boolean;
  collect: DeskStepCollect;
  recommend: DeskStepRecommend;
  discord: DeskStepDiscord;
}): DeskRunAlertInput {
  const collectSnapshot: DeskRunAlertInput["collect"] = isCollectStepFailure(
    input.collect
  )
    ? {
        ok: false,
        error: input.collect.error,
        region: input.region,
      }
    : {
        ok: input.collect.ok,
        region: input.region,
        save: input.collect.save,
        testMode: input.collect.testMode,
        dryRun: input.collect.dryRun,
        totals: {
          inserted: input.collect.totals.inserted,
          failed: input.collect.totals.failed,
        },
        feeds: input.collect.feeds,
      };

  const recommendSnapshot: DeskRunAlertInput["recommend"] = input.recommend.ok
    ? {
        ok: true,
        queued: input.recommend.queued ?? 0,
        updated: input.recommend.updated,
        openaiCalls: input.recommend.openaiCalls,
      }
    : {
        ok: false,
        error: input.recommend.error,
        step: input.recommend.step,
        openaiCalls: input.recommend.openaiCalls,
      };

  return {
    region: input.region,
    dryRun: input.dryRun,
    collect: collectSnapshot,
    recommend: recommendSnapshot,
    discord: {
      ok: input.discord.ok,
      sent: input.discord.sent,
      skipped: input.discord.skipped,
      dryRun: input.discord.dryRun,
      errors: input.discord.errors,
      briefEligibleCount: input.discord.briefEligibleCount,
    },
  };
}
