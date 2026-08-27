import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { describe, it } from "node:test";

import { selectMorningBriefItemsFromRows, isMorningBriefSendEligible } from "@/lib/collection-candidates/morningBriefSelection";
import type { CollectionCandidateRow } from "@/lib/collection-candidates/types";
import {
  isAllowedDiscordGuild,
  isAllowedDiscordUser,
  parseCandidateButtonCustomId,
} from "@/lib/discord/allowlist";
import {
  buildMorningBriefPayload,
  formatMorningBriefMessageContent,
} from "@/lib/discord/morningBriefMessage";
import { handleDiscordComponentInteraction } from "@/lib/discord/handleInteractionCore";
import {
  verifyDiscordInteractionHeaders,
  verifyDiscordInteractionHeadersAsync,
  verifyDiscordRequestSignature,
} from "@/lib/discord/verifySignature";

const CANDIDATE_ID = "11111111-1111-4111-8111-111111111111";
const GUILD_ID = "999999999999999999";
const USER_ID = "888888888888888888";

function stubDeps(
  overrides: Partial<import("@/lib/discord/handleInteractionCore").InteractionHandlerDeps> = {}
): import("@/lib/discord/handleInteractionCore").InteractionHandlerDeps {
  return {
    allowedGuildId: GUILD_ID,
    allowedUserIds: new Set([USER_ID]),
    fetchCandidate: async () => null,
    fetchStatus: async () => "pending",
    shortlist: async () => ({ ok: false, error: "unused" }),
    dismiss: async () => ({ ok: false, error: "unused" }),
    ...overrides,
  };
}

function row(partial: Partial<CollectionCandidateRow>): CollectionCandidateRow {
  return {
    id: partial.id ?? CANDIDATE_ID,
    source: partial.source ?? "ap",
    source_country: "US",
    feed_label: partial.feed_label ?? "AP",
    original_url: partial.original_url ?? "https://apnews.com/article/test",
    rss_title: partial.rss_title ?? "Congress votes on war powers after missile strike",
    rss_summary: partial.rss_summary ?? "Lawmakers debate response to escalation.",
    rss_title_ko: null,
    rss_summary_ko: null,
    rss_published_at: partial.rss_published_at ?? "2026-08-24T12:00:00.000Z",
    rss_guid: null,
    custom_unique_id: null,
    status: partial.status ?? "pending",
    selected_at: null,
    selected_by: null,
    dismissed_at: null,
    dismissed_by: null,
    dismiss_reason: null,
    enrich_started_at: null,
    enrich_completed_at: null,
    enrich_step: null,
    enrich_error: null,
    enrich_category: null,
    enrich_attempt_count: 0,
    article_id: null,
    collection_run_id: null,
    ai_recommend_grade: partial.ai_recommend_grade ?? "best",
    ai_recommend_score: partial.ai_recommend_score ?? 90,
    ai_recommend_reason: partial.ai_recommend_reason ?? "국제 파급력 큰 정치 이슈",
    ai_recommended_at: partial.ai_recommended_at ?? "2026-08-24T10:00:00.000Z",
    discord_brief_sent_at: partial.discord_brief_sent_at ?? null,
    discord_brief_message_id: partial.discord_brief_message_id ?? null,
    created_at: partial.created_at ?? "2026-08-24T09:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-08-24T09:00:00.000Z",
  };
}

describe("Discord desk (fixture only, no OpenAI/Discord/RSS)", () => {
  it("PING interaction → pong", async () => {
    const result = await handleDiscordComponentInteraction({ type: 1 }, stubDeps());
    assert.equal(result.kind, "pong");
  });

  it("invalid signature → verify fails", () => {
    const ok = verifyDiscordRequestSignature({
      publicKeyHex: "a".repeat(64),
      signatureHex: "00".repeat(64),
      timestamp: String(Math.floor(Date.now() / 1000)),
      body: '{"type":1}',
    });
    assert.equal(ok, false);
  });

  it("valid Ed25519 signature verifies", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const der = publicKey.export({ type: "spki", format: "der" });
    const publicKeyHex = der.subarray(der.length - 32).toString("hex");

    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = '{"type":1}';
    const signatureHex = sign(
      null,
      Buffer.from(timestamp + body),
      privateKey
    ).toString("hex");

    assert.equal(
      verifyDiscordInteractionHeaders({
        publicKeyHex,
        signature: signatureHex,
        timestamp,
        body,
      }),
      true
    );

    assert.equal(
      await verifyDiscordInteractionHeadersAsync({
        publicKeyHex,
        signature: signatureHex,
        timestamp,
        body,
      }),
      true
    );
  });

  it("rejects wrong guild", async () => {
    const result = await handleDiscordComponentInteraction(
      {
        type: 3,
        guild_id: "000000000000000000",
        member: { user: { id: USER_ID } },
        data: { custom_id: `cc:sl:${CANDIDATE_ID}` },
      },
      stubDeps()
    );
    assert.equal(result.kind, "forbidden");
  });

  it("rejects disallowed user", async () => {
    const result = await handleDiscordComponentInteraction(
      {
        type: 3,
        guild_id: GUILD_ID,
        member: { user: { id: "000000000000000001" } },
        data: { custom_id: `cc:sl:${CANDIDATE_ID}` },
      },
      stubDeps()
    );
    assert.equal(result.kind, "ephemeral");
    if (result.kind === "ephemeral") {
      assert.match(result.message, /권한/);
    }
  });

  it("shortlist button → shortlisted update message", async () => {
    const item = {
      id: CANDIDATE_ID,
      source: "ap",
      feedLabel: "AP",
      title: "Test headline",
      originalUrl: "https://apnews.com/article/test",
      rssPublishedAt: "2026-08-24T12:00:00.000Z",
      aiRecommendGrade: "best" as const,
      aiRecommendScore: 90,
      aiRecommendReason: "중요 이슈",
    };

    const result = await handleDiscordComponentInteraction(
      {
        type: 3,
        guild_id: GUILD_ID,
        member: { user: { id: USER_ID } },
        data: { custom_id: `cc:sl:${CANDIDATE_ID}` },
      },
      stubDeps({
        fetchCandidate: async () => item,
        fetchStatus: async () => "pending",
        shortlist: async () => ({ ok: true, count: 1, ids: [CANDIDATE_ID] }),
      })
    );

    assert.equal(result.kind, "update_message");
    if (result.kind === "update_message") {
      assert.match(result.data.content, /편집 보관함에 담김/);
      const row0 = result.data.components[0] as {
        components: Array<{ disabled?: boolean }>;
      };
      assert.equal(row0.components[0]?.disabled, true);
    }
  });

  it("dismiss button → dismissed update message", async () => {
    const item = {
      id: CANDIDATE_ID,
      source: "ap",
      feedLabel: "AP",
      title: "Test headline",
      originalUrl: "https://apnews.com/article/test",
      rssPublishedAt: "2026-08-24T12:00:00.000Z",
      aiRecommendGrade: "priority" as const,
      aiRecommendScore: 80,
      aiRecommendReason: "시의성",
    };

    const result = await handleDiscordComponentInteraction(
      {
        type: 3,
        guild_id: GUILD_ID,
        member: { user: { id: USER_ID } },
        data: { custom_id: `cc:ds:${CANDIDATE_ID}` },
      },
      stubDeps({
        fetchCandidate: async () => item,
        fetchStatus: async () => "pending",
        dismiss: async () => ({
          ok: true,
          id: CANDIDATE_ID,
          previousStatus: "pending",
        }),
      })
    );

    assert.equal(result.kind, "update_message");
    if (result.kind === "update_message") {
      assert.match(result.data.content, /제외됨/);
    }
  });

  it("already shortlisted re-click → safe update without duplicate shortlist", async () => {
    let shortlistCalls = 0;
    const item = {
      id: CANDIDATE_ID,
      source: "ap",
      feedLabel: "AP",
      title: "Test",
      originalUrl: "https://apnews.com/x",
      rssPublishedAt: null,
      aiRecommendGrade: "best" as const,
      aiRecommendScore: 90,
      aiRecommendReason: "reason",
    };

    const result = await handleDiscordComponentInteraction(
      {
        type: 3,
        guild_id: GUILD_ID,
        member: { user: { id: USER_ID } },
        data: { custom_id: `cc:sl:${CANDIDATE_ID}` },
      },
      stubDeps({
        fetchCandidate: async () => item,
        fetchStatus: async () => "shortlisted",
        shortlist: async () => {
          shortlistCalls += 1;
          return { ok: true, count: 0, ids: [] };
        },
      })
    );

    assert.equal(shortlistCalls, 1);
    assert.equal(result.kind, "update_message");
  });

  it("selectMorningBriefItems keeps best/priority only after post-process", () => {
    const items = selectMorningBriefItemsFromRows(
      [
        row({
          id: "11111111-1111-4111-8111-111111111111",
          ai_recommend_grade: "best",
          rss_title: "Congress votes on war powers after missile strike",
          rss_summary: "Lawmakers debate response.",
        }),
        row({
          id: "22222222-2222-4222-8222-222222222222",
          ai_recommend_grade: "priority",
          rss_title: "Presidential election recount ordered in key state",
          rss_summary: "Court orders review.",
        }),
        row({
          id: "33333333-3333-4333-8333-333333333333",
          ai_recommend_grade: "normal",
          rss_title: "Routine local weather forecast for Tuesday",
          rss_summary: "Sunny skies expected.",
        }),
        row({
          id: "44444444-4444-4444-8444-444444444444",
          ai_recommend_grade: "best",
          rss_title: "Chiefs beat Bills 27-24 in AFC championship thriller",
          rss_summary: "Kansas City advances after late touchdown.",
          original_url: "https://apnews.com/sports/nfl/chiefs-bills",
        }),
      ],
      10
    );

    assert.ok(items.length >= 2);
    assert.ok(items.every((i) => i.aiRecommendGrade === "best" || i.aiRecommendGrade === "priority"));
    const nfl = items.find((i) => i.title.includes("Chiefs"));
    assert.equal(nfl, undefined);
  });

  it("same-event post-process leaves one best in brief selection", () => {
    const items = selectMorningBriefItemsFromRows(
      [
        row({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          ai_recommend_grade: "best",
          rss_title: "Ukraine peace talks stall as Russia advances in east",
          rss_summary: "Diplomats say negotiations failed.",
        }),
        row({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          ai_recommend_grade: "best",
          rss_title: "Russia advances in eastern Ukraine as peace talks stall",
          rss_summary: "Negotiations collapse in Donbas.",
        }),
        row({
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          ai_recommend_grade: "best",
          rss_title: "Peace talks over Ukraine war stall after Russian advance",
          rss_summary: "Western officials warn of escalation.",
        }),
      ],
      10
    );

    const bestCount = items.filter((i) => i.aiRecommendGrade === "best").length;
    assert.equal(bestCount, 1);
  });

  it("parseCandidateButtonCustomId validates UUID", () => {
    assert.deepEqual(parseCandidateButtonCustomId(`cc:sl:${CANDIDATE_ID}`), {
      action: "shortlist",
      candidateId: CANDIDATE_ID,
    });
    assert.equal(parseCandidateButtonCustomId("cc:sl:not-a-uuid"), null);
  });

  it("morning brief message format and link button", () => {
    const content = formatMorningBriefMessageContent({
      id: CANDIDATE_ID,
      source: "ap",
      feedLabel: "AP",
      title: "Headline",
      originalUrl: "https://apnews.com/x",
      rssPublishedAt: "2026-08-24T12:00:00.000Z",
      aiRecommendGrade: "best",
      aiRecommendScore: 90,
      aiRecommendReason: "특종 후보",
    });
    assert.match(content, /⭐ BEST/);
    assert.match(content, /Headline/);
    assert.match(content, /특종 후보/);
    assert.match(content, /AI 추천 ≠ 자동 공개/);

    const payload = buildMorningBriefPayload(
      {
        id: CANDIDATE_ID,
        source: "ap",
        feedLabel: "AP",
        title: "Headline",
        originalUrl: "https://apnews.com/x",
        rssPublishedAt: null,
        aiRecommendGrade: "priority",
        aiRecommendScore: 80,
        aiRecommendReason: "시의성",
      },
      "active"
    );
    const link = payload.components[0]?.components.find(
      (c) => "url" in c && c.url
    );
    assert.ok(link && "url" in link);
    assert.equal(link.url, "https://apnews.com/x");
    const makeBtn = payload.components[0]?.components.find(
      (c) => "custom_id" in c && String(c.custom_id).startsWith("cc:mk:")
    );
    assert.ok(makeBtn);
    assert.equal(
      parseCandidateButtonCustomId(`cc:mk:${CANDIDATE_ID}`)?.action,
      "make_article"
    );
  });

  it("discord_brief_sent_at excludes re-send eligibility", () => {
    assert.equal(
      isMorningBriefSendEligible({
        status: "pending",
        ai_recommended_at: "2026-08-24T10:00:00.000Z",
        discord_brief_sent_at: null,
      }),
      true
    );
    assert.equal(
      isMorningBriefSendEligible({
        status: "pending",
        ai_recommended_at: "2026-08-24T10:00:00.000Z",
        discord_brief_sent_at: "2026-08-24T11:00:00.000Z",
      }),
      false
    );
  });
});
