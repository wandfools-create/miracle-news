import type { CollectRegion } from "@/lib/rss/collectRegions";
import type { FeedCollectStats } from "@/lib/rss/collectRssToReviewQueue";

export type DeskAlertLevel = "warning" | "error";

export type DeskStepCollectSnapshot =
  | {
      ok: false;
      error: string;
      region: CollectRegion;
    }
  | {
      ok: boolean;
      region: CollectRegion;
      save: boolean;
      testMode: boolean;
      dryRun: boolean;
      totals: {
        inserted: number;
        failed: number;
      };
      feeds: FeedCollectStats[];
    };

export type DeskStepRecommendSnapshot =
  | {
      ok: true;
      queued: number;
      updated: number | null;
      openaiCalls: number;
    }
  | {
      ok: false;
      error: string;
      step?: string;
      openaiCalls: number;
    };

export type DeskStepDiscordSnapshot = {
  ok: boolean;
  sent: number;
  skipped: number;
  dryRun: boolean;
  errors: string[];
  briefEligibleCount: number;
};

export type DeskRunAlertInput = {
  region: CollectRegion;
  dryRun: boolean;
  collect: DeskStepCollectSnapshot;
  recommend: DeskStepRecommendSnapshot;
  discord: DeskStepDiscordSnapshot;
};

export type DeskSystemAlert = {
  level: DeskAlertLevel;
  region: CollectRegion;
  deskLabel: string;
  timeEt: string;
  primaryStage: string;
  lines: string[];
  sourceStatuses: string[];
  resultLines: string[];
};
