import "server-only";

import { dismissCollectionCandidate } from "@/lib/collection-candidates/dismissCollectionCandidate";
import {
  fetchCandidateForMorningBriefMessage,
  fetchCandidateStatus,
} from "@/lib/collection-candidates/fetchMorningBriefCandidates";
import { shortlistCollectionCandidates } from "@/lib/collection-candidates/shortlistOps";
import { getDiscordEnv } from "@/lib/discord/env";
import {
  handleDiscordComponentInteraction,
  type DiscordInteractionPayload,
  type InteractionHandlerResult,
} from "@/lib/discord/handleInteractionCore";

export type { DiscordInteractionPayload, InteractionHandlerResult };

export async function handleDiscordInteractionForRoute(
  payload: DiscordInteractionPayload
): Promise<InteractionHandlerResult> {
  const env = getDiscordEnv();
  if (!env) {
    return { kind: "bad_request", message: "discord_not_configured" };
  }

  return handleDiscordComponentInteraction(payload, {
    allowedGuildId: env.guildId,
    allowedUserIds: env.allowedUserIds,
    dismiss: dismissCollectionCandidate,
    shortlist: shortlistCollectionCandidates,
    fetchCandidate: fetchCandidateForMorningBriefMessage,
    fetchStatus: fetchCandidateStatus,
  });
}
