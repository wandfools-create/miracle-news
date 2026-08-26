/** System ops alerts channel; falls back to morning brief channel. */
export function getDiscordSystemAlertsChannelId(
  morningBriefChannelId: string
): string {
  const dedicated = process.env.DISCORD_SYSTEM_ALERTS_CHANNEL_ID?.trim();
  return dedicated || morningBriefChannelId;
}
