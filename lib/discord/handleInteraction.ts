import "server-only";

import { dismissCollectionCandidate } from "@/lib/collection-candidates/dismissCollectionCandidate";
import {
  fetchCandidateForMorningBriefMessage,
  fetchCandidateStatus,
} from "@/lib/collection-candidates/fetchMorningBriefCandidates";
import { promoteCollectionCandidate } from "@/lib/collection-candidates/promoteCollectionCandidate";
import { quickPublishArticle } from "@/lib/articles/publishArticle";
import { shortlistCollectionCandidates } from "@/lib/collection-candidates/shortlistOps";
import { editOriginalInteractionMessage, sendDiscordChannelMessage } from "@/lib/discord/discordApi";
import { getDiscordEnv } from "@/lib/discord/env";
import { buildArticleReadyPayload } from "@/lib/discord/morningBriefMessage";
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
    publishReadyArticle: async ({ articleId }) => {
      const result = await quickPublishArticle(articleId, {
        allowSameEventOverride: true,
      });
      return result.ok
        ? { ok: true as const }
        : { ok: false as const, error: result.error, step: result.step };
    },
    notifyArticleReady: async ({ articleId, title, source }) => {
      if (!env.articleReadyChannelId) {
        return { ok: false as const, error: "article_ready_channel_not_configured" };
      }
      const payload = buildArticleReadyPayload({ articleId, title, source });
      const sent = await sendDiscordChannelMessage({
        channelId: env.articleReadyChannelId,
        botToken: env.botToken,
        body: payload,
      });
      return sent.ok
        ? { ok: true as const }
        : { ok: false as const, error: sent.error };
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
