import {
  isAllowedDiscordGuild,
  isAllowedDiscordUser,
  parseCandidateButtonCustomId,
  parsePublishReadyArticleCustomId,
} from "@/lib/discord/allowlist";
import { isEditorialDiscordEnabled } from "@/lib/discord/editorialDiscordPolicy";
import {
  buildArticleReadyPayload,
  buildMorningBriefPayload,
  type MorningBriefMessageState,
} from "@/lib/discord/morningBriefMessage";
import type { MorningBriefItem } from "@/lib/discord/morningBriefMessage";

export type DiscordInteractionPayload = {
  type: number;
  token?: string;
  application_id?: string;
  data?: { custom_id?: string };
  member?: { user?: { id?: string } };
  user?: { id?: string };
  guild_id?: string;
};

export type InteractionHandlerResult =
  | { kind: "pong" }
  | { kind: "unauthorized"; status: 401 }
  | { kind: "forbidden"; message: string }
  | { kind: "bad_request"; message: string }
  | { kind: "update_message"; data: { content: string; components: unknown[] } }
  | { kind: "ephemeral"; message: string }
  | {
      kind: "deferred_update";
      /** Runs after Discord receives type-5 ACK (promote + edit message). */
      continueWork: () => Promise<void>;
    };

export type ShortlistFn = (input: {
  candidateIds: string[];
  shortlistedBy?: string | null;
}) => Promise<
  | { ok: true; count: number; ids: string[] }
  | { ok: false; error: string }
>;

export type DismissFn = (input: {
  candidateId: string;
  dismissedBy?: string | null;
}) => Promise<
  | { ok: true; id: string; previousStatus: string }
  | { ok: false; error: string }
>;

export type MakeArticleFn = (input: {
  candidateId: string;
  selectedBy?: string | null;
}) => Promise<
  | { ok: true; articleId: string; alreadyEnriched?: boolean }
  | {
      ok: false;
      error: string;
      step?: string;
      sameEventArticleId?: string;
      sameEventTitle?: string;
    }
>;

export type EditOriginalMessageFn = (input: {
  content: string;
  components: unknown[];
}) => Promise<{ ok: true } | { ok: false; error: string }>;

export type PublishReadyArticleFn = (input: { articleId: string }) => Promise<
  { ok: true } | { ok: false; error: string; step?: string }
>;

export type NotifyArticleReadyFn = (input: {
  articleId: string;
  title: string;
  source: string;
}) => Promise<{ ok: true } | { ok: false; error: string }>;

export type InteractionHandlerDeps = {
  allowedGuildId: string;
  allowedUserIds: Set<string>;
  dismiss: DismissFn;
  shortlist: ShortlistFn;
  makeArticle?: MakeArticleFn;
  publishReadyArticle?: PublishReadyArticleFn;
  notifyArticleReady?: NotifyArticleReadyFn;
  editOriginalMessage?: EditOriginalMessageFn;
  fetchCandidate: (candidateId: string) => Promise<MorningBriefItem | null>;
  fetchStatus: (candidateId: string) => Promise<string | null>;
};

function buildUpdateResult(
  item: MorningBriefItem,
  state: MorningBriefMessageState,
  extra?: { articleId?: string; error?: string }
): InteractionHandlerResult {
  const payload = buildMorningBriefPayload(item, state, extra);
  return {
    kind: "update_message",
    data: {
      content: payload.content,
      components: payload.components,
    },
  };
}

export async function handleDiscordComponentInteraction(
  payload: DiscordInteractionPayload,
  deps: InteractionHandlerDeps
): Promise<InteractionHandlerResult> {
  if (payload.type === 1) {
    return { kind: "pong" };
  }

  if (!isEditorialDiscordEnabled()) {
    return {
      kind: "ephemeral",
      message:
        "편집용 Discord 기능이 비활성화되어 있습니다. 모바일 관리자를 사용해 주세요.",
    };
  }

  if (payload.type !== 3) {
    return { kind: "bad_request", message: "unsupported_interaction_type" };
  }

  const guildId = payload.guild_id;
  if (!isAllowedDiscordGuild(guildId, deps.allowedGuildId)) {
    return { kind: "forbidden", message: "권한이 없습니다." };
  }

  const userId = payload.member?.user?.id ?? payload.user?.id;
  if (!isAllowedDiscordUser(userId, deps.allowedUserIds)) {
    return { kind: "ephemeral", message: "권한이 없습니다." };
  }

  const customId = payload.data?.custom_id;
  if (!customId) {
    return { kind: "bad_request", message: "missing_custom_id" };
  }

  const readyArticleId = parsePublishReadyArticleCustomId(customId);
  if (readyArticleId) {
    if (!deps.publishReadyArticle || !deps.editOriginalMessage) {
      return { kind: "ephemeral", message: "바로 공개 기능이 설정되지 않았습니다." };
    }
    return {
      kind: "deferred_update",
      continueWork: async () => {
        const result = await deps.publishReadyArticle!({ articleId: readyArticleId });
        const message = buildArticleReadyPayload({
          articleId: readyArticleId,
          title: "기사",
          source: "한눈",
          state: result.ok ? "published" : "failed",
          ...(!result.ok ? { error: result.error } : {}),
        });
        await deps.editOriginalMessage!(message);
      },
    };
  }

  const parsed = parseCandidateButtonCustomId(customId);
  if (!parsed) {
    return { kind: "bad_request", message: "invalid_custom_id" };
  }

  const item = await deps.fetchCandidate(parsed.candidateId);
  if (!item) {
    return { kind: "ephemeral", message: "후보를 찾을 수 없습니다." };
  }

  const actor = `discord:${userId}`;

  if (parsed.action === "make_article") {
    if (!deps.makeArticle || !deps.editOriginalMessage) {
      return {
        kind: "ephemeral",
        message: "기사 만들기 기능이 아직 연결되지 않았습니다.",
      };
    }

    const makeArticle = deps.makeArticle;
    const editOriginal = deps.editOriginalMessage;

    return {
      kind: "deferred_update",
      continueWork: async () => {
        try {
          const result = await makeArticle({
            candidateId: parsed.candidateId,
            selectedBy: actor,
          });

          if (!result.ok) {
            if (result.step === "same_event_published") {
              const blocked = buildMorningBriefPayload(
                item,
                "same_event_blocked",
                {
                  error: result.error,
                  sameEventArticleId: result.sameEventArticleId,
                  sameEventTitle: result.sameEventTitle,
                }
              );
              await editOriginal({
                content: blocked.content,
                components: blocked.components,
              });
              return;
            }
            const failed = buildMorningBriefPayload(item, "article_failed", {
              error: result.error,
            });
            await editOriginal({
              content: failed.content,
              components: failed.components,
            });
            return;
          }

          const created = buildMorningBriefPayload(item, "article_created", {
            articleId: result.articleId,
          });
          await editOriginal({
            content: created.content,
            components: created.components,
          });
          if (deps.notifyArticleReady) {
            await deps.notifyArticleReady({
              articleId: result.articleId,
              title: item.title,
              source: item.feedLabel?.trim() || item.source,
            });
          }
        } catch (err) {
          const failed = buildMorningBriefPayload(item, "article_failed", {
            error: String(err),
          });
          await editOriginal({
            content: failed.content,
            components: failed.components,
          });
        }
      },
    };
  }

  if (parsed.action === "shortlist") {
    const result = await deps.shortlist({
      candidateIds: [parsed.candidateId],
      shortlistedBy: actor,
    });

    if (!result.ok || result.count === 0) {
      const current = await deps.fetchStatus(parsed.candidateId);
      if (current === "shortlisted") {
        return buildUpdateResult(item, "shortlisted");
      }
      if (current === "dismissed") {
        return buildUpdateResult(item, "dismissed");
      }
      if (current === "enriched") {
        return {
          kind: "ephemeral",
          message: "이미 기사로 만들어진 후보입니다.",
        };
      }
      return {
        kind: "ephemeral",
        message: "보관함에 담을 수 없습니다. 이미 처리됐을 수 있습니다.",
      };
    }

    return buildUpdateResult(item, "shortlisted");
  }

  const result = await deps.dismiss({
    candidateId: parsed.candidateId,
    dismissedBy: actor,
  });

  if (!result.ok) {
    const current = await deps.fetchStatus(parsed.candidateId);
    if (current === "dismissed") {
      return buildUpdateResult(item, "dismissed");
    }
    if (current === "shortlisted") {
      return { kind: "ephemeral", message: "이미 편집 보관함에 있습니다." };
    }
    return {
      kind: "ephemeral",
      message: "제외할 수 없습니다. 이미 처리됐을 수 있습니다.",
    };
  }

  return buildUpdateResult(item, "dismissed");
}
