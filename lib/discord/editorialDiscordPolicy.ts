/**
 * Editorial Discord workflows (briefs, article-ready, publish buttons) can be
 * disabled independently from system outage alerts.
 *
 * Production default: enabled unless EDITORIAL_DISCORD_ENABLED=false.
 * System alerts use separate paths and are not gated here.
 */
export function isEditorialDiscordEnabled(): boolean {
  const raw = process.env.EDITORIAL_DISCORD_ENABLED?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return true;
}

export const EDITORIAL_DISCORD_ENV_KEY = "EDITORIAL_DISCORD_ENABLED";
