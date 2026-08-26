import "server-only";

import {
  fetchMorningBriefItems,
  markDiscordBriefSent,
} from "@/lib/collection-candidates/fetchMorningBriefCandidates";
import { recommendUnevaluatedCollectionCandidates } from "@/lib/collection-candidates/recommendCollectionCandidates";
import { sendDiscordChannelMessage } from "@/lib/discord/discordApi";
import type { DiscordFetch } from "@/lib/discord/discordApi";
import { getDiscordEnv } from "@/lib/discord/env";
import { buildMorningBriefPayload } from "@/lib/discord/morningBriefMessage";
import type { CollectRegion } from "@/lib/rss/collectRegions";

export type MorningBriefRecommendResult = Awaited<
  ReturnType<typeof recommendUnevaluatedCollectionCandidates>
>;

export type MorningBriefDiscordResult = {
  ok: boolean;
  sent: number;
  skipped: number;
  errors: string[];
  dryRun?: boolean;
  region?: CollectRegion | null;
  /** best/priority items selected for brief (before send). */
  briefEligibleCount: number;
};

export type MorningBriefCronResult = {
  ok: boolean;
  recommend: MorningBriefRecommendResult | null;
  sent: number;
  skipped: number;
  errors: string[];
  dryRun?: boolean;
  region?: CollectRegion | null;
};

/**
 * AI recommend only (title+summary). Never promotes/publishes articles.
 */
export async function runMorningBriefRecommend(options?: {
  region?: CollectRegion | null;
}): Promise<MorningBriefRecommendResult> {
  return recommendUnevaluatedCollectionCandidates({
    region: options?.region ?? null,
  });
}

/**
 * Discord BEST/priority brief send only. Never creates/publishes articles.
 * Collect DB writes are never rolled back from Discord failures.
 */
export async function runMorningBriefDiscord(options?: {
  fetchImpl?: DiscordFetch;
  dryRun?: boolean;
  region?: CollectRegion | null;
}): Promise<MorningBriefDiscordResult> {
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;
  const region = options?.region ?? null;

  const discordEnv = getDiscordEnv();
  if (!discordEnv) {
    return {
      ok: false,
      sent,
      skipped,
      errors: ["discord:env_not_configured"],
      dryRun: options?.dryRun,
      region,
      briefEligibleCount: 0,
    };
  }

  let itemsResult: Awaited<ReturnType<typeof fetchMorningBriefItems>>;
  try {
    itemsResult = await fetchMorningBriefItems(
      discordEnv.morningBriefMaxItems,
      { region }
    );
    if (!itemsResult.ok) {
      return {
        ok: false,
        sent,
        skipped,
        errors: [`fetch:${itemsResult.error}`],
        dryRun: options?.dryRun,
        region,
        briefEligibleCount: 0,
      };
    }
  } catch (err) {
    return {
      ok: false,
      sent,
      skipped,
      errors: [`fetch:exception:${String(err)}`],
      dryRun: options?.dryRun,
      region,
      briefEligibleCount: 0,
    };
  }

  const briefEligibleCount = itemsResult.items.length;

  for (const item of itemsResult.items) {
    const payload = buildMorningBriefPayload(item, "active");

    if (options?.dryRun) {
      skipped += 1;
      continue;
    }

    try {
      const posted = await sendDiscordChannelMessage({
        channelId: discordEnv.morningBriefChannelId,
        botToken: discordEnv.botToken,
        body: payload,
        fetchImpl: options?.fetchImpl,
      });

      if (!posted.ok) {
        errors.push(`send:${item.id}:${posted.error}`);
        continue;
      }

      const marked = await markDiscordBriefSent({
        candidateId: item.id,
        messageId: posted.messageId,
      });

      if (!marked.ok) {
        errors.push(`mark:${item.id}:${marked.error}`);
        continue;
      }

      sent += 1;
    } catch (err) {
      errors.push(`send:exception:${item.id}:${String(err)}`);
    }
  }

  console.info("[morning-brief] discord step done", {
    region,
    sent,
    skipped,
    errorCount: errors.length,
  });

  return {
    ok: errors.length === 0 || sent > 0,
    sent,
    skipped,
    errors,
    dryRun: options?.dryRun,
    region,
    briefEligibleCount,
  };
}

/**
 * Morning Brief pipeline: AI recommend → Discord send.
 * Never creates or publishes articles. Steps are independent.
 */
export async function runMorningBriefCron(options?: {
  fetchImpl?: DiscordFetch;
  dryRun?: boolean;
  region?: CollectRegion | null;
}): Promise<MorningBriefCronResult> {
  const errors: string[] = [];
  let recommend: MorningBriefRecommendResult | null = null;
  const region = options?.region ?? null;

  try {
    recommend = await runMorningBriefRecommend({ region });
    if (!recommend.ok) {
      errors.push(`recommend:${recommend.step}:${recommend.error}`);
    }
  } catch (err) {
    errors.push(`recommend:exception:${String(err)}`);
  }

  let discord: MorningBriefDiscordResult;
  try {
    discord = await runMorningBriefDiscord({
      fetchImpl: options?.fetchImpl,
      dryRun: options?.dryRun,
      region,
    });
    errors.push(...discord.errors);
  } catch (err) {
    discord = {
      ok: false,
      sent: 0,
      skipped: 0,
      errors: [`discord:exception:${String(err)}`],
      dryRun: options?.dryRun,
      region,
      briefEligibleCount: 0,
    };
    errors.push(...discord.errors);
  }

  console.info("[morning-brief] cron done", {
    region,
    sent: discord.sent,
    skipped: discord.skipped,
    errorCount: errors.length,
    recommendUpdated: recommend?.ok ? recommend.updated : null,
  });

  return {
    ok: errors.length === 0 || discord.sent > 0,
    recommend,
    sent: discord.sent,
    skipped: discord.skipped,
    errors,
    dryRun: options?.dryRun,
    region,
  };
}
