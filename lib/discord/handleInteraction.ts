import "server-only";

import { dismissCollectionCandidate } from "@/lib/collection-candidates/dismissCollectionCandidate";
import {
  fetchCandidateForMorningBriefMessage,
  fetchCandidateStatus,
} from "@/lib/collection-candidates/fetchMorningBriefCandidates";
import { promoteCollectionCandidate } from "@/lib/collection-candidates/promoteCollectionCandidate";
import { shortlistCollectionCandidates } from "@/lib/collection-candidates/shortlistOps";
import { editOriginalInteractionMessage } from "@/lib/discord/discordApi";
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

  const token = payload.token?.trim() || "";
  const applicationId = payload.application_id?.trim() || env.applicationId;

  return handleDiscordComponentInteraction(payload, {
    allowedGuildId: env.guildId,
    allowedUserIds: env.allowedUserIds,
    dismiss: dismissCollectionCandidate,
    shortlist: shortlistCollectionCandidates,
    makeArticle: async ({ candidateId, selectedBy }) => {
      // OpenAI once via promote; lands in quick_review — never auto-publishes.
      return promoteCollectionCandidate({
        candidateId,
        selectedBy,
        landingWorkflow: "quick_review",
      });
    },
    editOriginalMessage: async ({ content, components }) => {
      if (!token) {
        return { ok: false, error: "missing_interaction_token" };
      }
      return editOriginalInteractionMessage({
        applicationId,
        interactionToken: token,
        body: { content, components },
      });
    },
    fetchCandidate: fetchCandidateForMorningBriefMessage,
    fetchStatus: fetchCandidateStatus,
  });
}
