import { NextRequest, NextResponse } from "next/server";

import {
  cronSecretMissingResponse,
  cronUnauthorizedResponse,
  isCronAuthorized,
} from "@/lib/cron/cronAuth";
import {
  collectJsonFromResult,
  runRegionalCollect,
} from "@/lib/cron/runRegionalCollect";
import { resolveRegionalDeskRunPlan } from "@/lib/cron/deskRunCadence";
import { buildDeskRunAlertInput } from "@/lib/desk/buildDeskRunAlertInput";
import { maybeSendDeskSystemAlert } from "@/lib/desk/sendDeskSystemAlert";
import {
  runMorningBriefDiscord,
  runMorningBriefRecommend,
} from "@/lib/discord/runMorningBrief";
import type { CollectRegion } from "@/lib/rss/collectRegions";

export type DeskStepCollect =
  | ReturnType<typeof collectJsonFromResult>
  | { ok: false; error: string; region: CollectRegion };

export type DeskStepRecommend =
  | {
      ok: true;
      updated: number | null;
      openaiCalls: number;
      queued?: number;
      model?: string;
      notRun?: boolean;
    }
  | {
      ok: false;
      error: string;
      step?: string;
      openaiCalls: number;
    };

export type DeskStepDiscord =
  | {
      ok: true;
      sent: number;
      skipped: number;
      dryRun: boolean;
      errors: string[];
      briefEligibleCount: number;
      notRun?: boolean;
    }
  | {
      ok: false;
      sent: number;
      skipped: number;
      dryRun: boolean;
      errors: string[];
      briefEligibleCount: number;
      error?: string;
    };

/**
 * One regional desk run: RSS collect → AI recommend → Discord brief.
 * Each step is independent try/catch — failures never roll back prior steps.
 * Never auto-creates or publishes articles.
 */
export async function runRegionalDeskOrchestrator(
  request: NextRequest,
  region: CollectRegion
): Promise<NextResponse> {
  if (!process.env.CRON_SECRET?.trim()) {
    return cronSecretMissingResponse();
  }
  if (!isCronAuthorized(request)) {
    return cronUnauthorizedResponse();
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const plan = resolveRegionalDeskRunPlan({
    region,
    method: request.method,
    searchParams: request.nextUrl.searchParams,
  });

  let collect: DeskStepCollect;
  try {
    const result = await runRegionalCollect(
      region,
      request.nextUrl.searchParams
    );
    collect = collectJsonFromResult(result, region);
  } catch (err) {
    console.error("[desk] collect step failed", { region, err });
    collect = { ok: false, error: String(err), region };
  }

  let recommend: DeskStepRecommend;
  if (!plan.runBrief) {
    recommend = {
      ok: true,
      updated: 0,
      openaiCalls: 0,
      queued: 0,
      notRun: true,
    };
  } else {
    try {
      const result = await runMorningBriefRecommend({ region });
      if (result.ok) {
        recommend = {
          ok: true,
          updated: result.updated,
          openaiCalls: result.openaiCalls,
          queued: result.queued,
          model: result.model,
        };
      } else {
        recommend = {
          ok: false,
          error: result.error,
          step: result.step,
          openaiCalls: result.openaiCalls,
        };
      }
    } catch (err) {
      console.error("[desk] recommend step failed", { region, err });
      recommend = { ok: false, error: String(err), openaiCalls: 0 };
    }
  }

  let discord: DeskStepDiscord;
  if (!plan.runBrief) {
    discord = {
      ok: true,
      sent: 0,
      skipped: 0,
      dryRun,
      errors: [],
      briefEligibleCount: 0,
      notRun: true,
    };
  } else {
    try {
      const result = await runMorningBriefDiscord({ dryRun, region });
      discord = {
        ok: result.ok,
        sent: result.sent,
        skipped: result.skipped,
        dryRun: result.dryRun ?? dryRun,
        errors: result.errors,
        briefEligibleCount: result.briefEligibleCount,
        ...(result.ok ? {} : { error: result.errors[0] ?? "discord_failed" }),
      };
    } catch (err) {
      console.error("[desk] discord step failed", { region, err });
      discord = {
        ok: false,
        sent: 0,
        skipped: 0,
        dryRun,
        errors: [String(err)],
        briefEligibleCount: 0,
        error: String(err),
      };
    }
  }

  let systemAlert: Awaited<ReturnType<typeof maybeSendDeskSystemAlert>> = {
    sent: false,
    reason: "none",
  };
  try {
    systemAlert = await maybeSendDeskSystemAlert(
      buildDeskRunAlertInput({
        region,
        dryRun,
        collect,
        recommend,
        discord,
      })
    );
  } catch (err) {
    console.warn("[desk] system alert step failed (ignored)", { region, err });
    systemAlert = { sent: false, reason: "send_failed", error: String(err) };
  }

  const ok = plan.runBrief
    ? collect.ok || recommend.ok || discord.ok
    : collect.ok;

  console.info("[desk] orchestrator done", {
    region,
    runReason: plan.reason,
    briefDue: plan.runBrief,
    collectOk: collect.ok,
    recommendOk: recommend.ok,
    discordOk: discord.ok,
    discordSent: discord.sent,
  });

  return NextResponse.json({
    ok,
    region,
    runPlan: plan,
    order: plan.runBrief
      ? (["collect", "recommend", "discord"] as const)
      : (["collect"] as const),
    steps: {
      collect,
      recommend,
      discord,
    },
    systemAlert,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  });
}
