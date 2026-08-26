import "server-only";

import type { DeskRunAlertInput } from "@/lib/desk/deskAlertTypes";
import {
  maybeSendDeskSystemAlertCore,
  type SendDeskSystemAlertResult,
} from "@/lib/desk/sendDeskSystemAlertCore";
import { sendDiscordChannelMessage } from "@/lib/discord/discordApi";
import type { DiscordFetch } from "@/lib/discord/discordApi";
import { getDiscordEnv } from "@/lib/discord/env";
import { getDiscordSystemAlertsChannelId } from "@/lib/discord/systemAlertsChannel";

export type { SendDeskSystemAlertResult };

/**
 * Evaluate desk run and send one summary alert if needed.
 * Failures here never throw to caller and never affect desk steps.
 */
export async function maybeSendDeskSystemAlert(
  input: DeskRunAlertInput,
  options?: {
    fetchImpl?: DiscordFetch;
    now?: Date;
  }
): Promise<SendDeskSystemAlertResult> {
  const result = await maybeSendDeskSystemAlertCore(input, {
    now: options?.now,
    discordEnv: getDiscordEnv(),
    resolveAlertsChannelId: getDiscordSystemAlertsChannelId,
    sendMessage: async ({ channelId, botToken, content }) => {
      const posted = await sendDiscordChannelMessage({
        channelId,
        botToken,
        body: { content },
        fetchImpl: options?.fetchImpl,
      });
      if (!posted.ok) return { ok: false, error: posted.error };
      return { ok: true };
    },
  });

  if (result.sent) {
    console.info("[desk-alert] sent", {
      level: result.level,
      region: input.region,
    });
  } else if (result.reason === "no_discord_env") {
    console.warn("[desk-alert] skipped — Discord env not configured");
  } else if (result.reason === "send_failed") {
    console.warn("[desk-alert] send failed", {
      region: input.region,
      error: result.error,
    });
  }

  return result;
}
