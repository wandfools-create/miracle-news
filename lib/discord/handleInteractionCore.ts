import {
  isAllowedDiscordGuild,
  isAllowedDiscordUser,
  parseCandidateButtonCustomId,
} from "@/lib/discord/allowlist";
import {
  buildMorningBriefPayload,
  type MorningBriefMessageState,
} from "@/lib/discord/morningBriefMessage";
import type { MorningBriefItem } from "@/lib/discord/morningBriefMessage";

export type DiscordInteractionPayload = {
  type: number;
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
  | { kind: "ephemeral"; message: string };

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

export type InteractionHandlerDeps = {
  allowedGuildId: string;
  allowedUserIds: Set<string>;
  dismiss: DismissFn;
  shortlist: ShortlistFn;
  fetchCandidate: (candidateId: string) => Promise<MorningBriefItem | null>;
  fetchStatus: (candidateId: string) => Promise<string | null>;
};

function buildUpdateResult(
  item: MorningBriefItem,
  state: MorningBriefMessageState
): InteractionHandlerResult {
  const payload = buildMorningBriefPayload(item, state);
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

  const parsed = parseCandidateButtonCustomId(customId);
  if (!parsed) {
    return { kind: "bad_request", message: "invalid_custom_id" };
  }

  const item = await deps.fetchCandidate(parsed.candidateId);
  if (!item) {
    return { kind: "ephemeral", message: "후보를 찾을 수 없습니다." };
  }

  const actor = `discord:${userId}`;

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
