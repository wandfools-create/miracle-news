import "server-only";

export type DiscordEnv = {
  applicationId: string;
  publicKey: string;
  botToken: string;
  guildId: string;
  morningBriefChannelId: string;
  articleReadyChannelId: string | null;
  allowedUserIds: Set<string>;
  morningBriefMaxItems: number;
};

function parseAllowedUserIds(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

export function getMorningBriefMaxItems(): number {
  const raw = process.env.DISCORD_MORNING_BRIEF_MAX_ITEMS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 10;
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.min(n, 25);
}

export function getDiscordEnv(): DiscordEnv | null {
  const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
  const publicKey = process.env.DISCORD_PUBLIC_KEY?.trim();
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const morningBriefChannelId =
    process.env.DISCORD_MORNING_BRIEF_CHANNEL_ID?.trim();
  const articleReadyChannelId =
    process.env.DISCORD_ARTICLE_READY_CHANNEL_ID?.trim() || null;
  const allowedUserIds = parseAllowedUserIds(
    process.env.DISCORD_ALLOWED_USER_IDS
  );

  if (
    !applicationId ||
    !publicKey ||
    !botToken ||
    !guildId ||
    !morningBriefChannelId ||
    allowedUserIds.size === 0
  ) {
    return null;
  }

  return {
    applicationId,
    publicKey,
    botToken,
    guildId,
    morningBriefChannelId,
    articleReadyChannelId,
    allowedUserIds,
    morningBriefMaxItems: getMorningBriefMaxItems(),
  };
}

export { getDiscordSystemAlertsChannelId } from "@/lib/discord/systemAlertsChannel";

/** Interactions PING only needs the public key. */
export function getDiscordPublicKey(): string | null {
  const raw = process.env.DISCORD_PUBLIC_KEY?.trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, "");
  if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw)) return null;
  return raw;
}

export function isDiscordConfigured(): boolean {
  return getDiscordEnv() !== null;
}
