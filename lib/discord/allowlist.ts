const CANDIDATE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CandidateButtonAction = "shortlist" | "dismiss" | "make_article";

export function isValidCandidateUuid(value: string): boolean {
  return CANDIDATE_UUID_RE.test(value.trim());
}

export function buildShortlistCustomId(candidateId: string): string {
  return `cc:sl:${candidateId}`;
}

export function buildDismissCustomId(candidateId: string): string {
  return `cc:ds:${candidateId}`;
}

export function buildMakeArticleCustomId(candidateId: string): string {
  return `cc:mk:${candidateId}`;
}

export function parseCandidateButtonCustomId(
  customId: string
): { action: CandidateButtonAction; candidateId: string } | null {
  const trimmed = customId.trim();
  const match = trimmed.match(/^cc:(sl|ds|mk):(.+)$/);
  if (!match) return null;

  const candidateId = match[2]!.trim();
  if (!isValidCandidateUuid(candidateId)) return null;

  const code = match[1];
  const action: CandidateButtonAction =
    code === "sl" ? "shortlist" : code === "ds" ? "dismiss" : "make_article";

  return { action, candidateId };
}

export function isAllowedDiscordGuild(
  guildId: string | null | undefined,
  allowedGuildId: string
): boolean {
  return Boolean(guildId?.trim()) && guildId!.trim() === allowedGuildId.trim();
}

export function isAllowedDiscordUser(
  userId: string | null | undefined,
  allowedUserIds: Set<string>
): boolean {
  if (!userId?.trim() || allowedUserIds.size === 0) return false;
  return allowedUserIds.has(userId.trim());
}
