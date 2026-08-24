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

export type MorningBriefCronResult = {
  ok: boolean;
  recommend: Awaited<ReturnType<typeof recommendUnevaluatedCollectionCandidates>> | null;
  sent: number;
  skipped: number;
  errors: string[];
  dryRun?: boolean;
};

/**
 * Morning Brief pipeline: optional AI recommend → post-process filter → Discord send.
 * Discord failures never throw to caller; RSS/DB unaffected.
 */
export async function runMorningBriefCron(options?: {
  fetchImpl?: DiscordFetch;
  /** When true, skip Discord HTTP (local/tests). */
  dryRun?: boolean;
}): Promise<MorningBriefCronResult> {
  const errors: string[] = [];
  let recommend: MorningBriefCronResult["recommend"] = null;
  let sent = 0;
  let skipped = 0;

  try {
    recommend = await recommendUnevaluatedCollectionCandidates();
    if (!recommend.ok) {
      errors.push(`recommend:${recommend.step}:${recommend.error}`);
    }
  } catch (err) {
    errors.push(`recommend:exception:${String(err)}`);
  }

  const discordEnv = getDiscordEnv();
  if (!discordEnv) {
    errors.push("discord:env_not_configured");
    return { ok: errors.length === 0, recommend, sent, skipped, errors, dryRun: options?.dryRun };
  }

  let itemsResult: Awaited<ReturnType<typeof fetchMorningBriefItems>>;
  try {
    itemsResult = await fetchMorningBriefItems(discordEnv.morningBriefMaxItems);
    if (!itemsResult.ok) {
      errors.push(`fetch:${itemsResult.error}`);
      return { ok: false, recommend, sent, skipped, errors, dryRun: options?.dryRun };
    }
  } catch (err) {
    errors.push(`fetch:exception:${String(err)}`);
    return { ok: false, recommend, sent, skipped, errors, dryRun: options?.dryRun };
  }

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

  console.info("[morning-brief] cron done", {
    sent,
    skipped,
    errorCount: errors.length,
    recommendUpdated: recommend?.ok ? recommend.updated : null,
  });

  return {
    ok: errors.length === 0 || sent > 0,
    recommend,
    sent,
    skipped,
    errors,
    dryRun: options?.dryRun,
  };
}
