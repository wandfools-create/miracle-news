import {
  analyzeDeskSystemAlert,
  formatDeskSystemAlertMessage,
} from "@/lib/desk/analyzeDeskSystemAlert";
import type { DeskRunAlertInput } from "@/lib/desk/deskAlertTypes";

export type SendDeskSystemAlertResult =
  | { sent: false; reason: "none" | "dry_run" | "no_discord_env" }
  | { sent: true; level: "warning" | "error" }
  | { sent: false; reason: "send_failed"; error: string };

export type DeskSystemAlertDiscordEnv = {
  botToken: string;
  morningBriefChannelId: string;
};

export type DeskAlertMessageSender = (input: {
  channelId: string;
  botToken: string;
  content: string;
}) => Promise<{ ok: true } | { ok: false; error: string }>;

/**
 * Evaluate desk run and send one summary alert if needed.
 * Failures never throw to caller. Transport is injected (no server-only).
 */
export async function maybeSendDeskSystemAlertCore(
  input: DeskRunAlertInput,
  options: {
    now?: Date;
    discordEnv: DeskSystemAlertDiscordEnv | null;
    resolveAlertsChannelId: (morningBriefChannelId: string) => string;
    sendMessage: DeskAlertMessageSender;
  }
): Promise<SendDeskSystemAlertResult> {
  const alert = analyzeDeskSystemAlert(input, options.now);
  if (!alert) return { sent: false, reason: "none" };

  const discordEnv = options.discordEnv;
  if (!discordEnv) {
    return { sent: false, reason: "no_discord_env" };
  }

  const channelId = options.resolveAlertsChannelId(
    discordEnv.morningBriefChannelId
  );
  const content = formatDeskSystemAlertMessage(alert);

  try {
    const posted = await options.sendMessage({
      channelId,
      botToken: discordEnv.botToken,
      content,
    });

    if (!posted.ok) {
      return { sent: false, reason: "send_failed", error: posted.error };
    }

    return { sent: true, level: alert.level };
  } catch (err) {
    return { sent: false, reason: "send_failed", error: String(err) };
  }
}
