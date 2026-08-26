import "server-only";

import { dismissCollectionCandidate } from "@/lib/collection-candidates/dismissCollectionCandidate";
import {
  fetchCandidateForMorningBriefMessage,
  fetchCandidateStatus,
} from "@/lib/collection-candidates/fetchMorningBriefCandidates";
import { promoteCollectionCandidate } from "@/lib/collection-candidates/promoteCollectionCandidate";
import { quickPublishArticle } from "@/lib/articles/publishArticle";
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
      // This Discord button is an explicit human publish command. Generate into
      // quick_review first so all existing content/SAME EVENT guards can run,
      // then publish immediately without another admin-screen confirmation.
      const promoted = await promoteCollectionCandidate({
        candidateId,
        selectedBy,
        landingWorkflow: "quick_review",
      });
      if (!promoted.ok) return promoted;

      const published = await quickPublishArticle(promoted.articleId);
      if (!published.ok) {
        return {
          ok: false,
          error: `기사 생성은 완료되었으나 공개하지 못했습니다: ${published.error}`,
          step: `publish_${published.step}`,
          articleId: promoted.articleId,
          sameEventArticleId: published.sameEventMatch?.id,
          sameEventTitle: published.sameEventMatch?.title,
        };
      }

      return promoted;
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
