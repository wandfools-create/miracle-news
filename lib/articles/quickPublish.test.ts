import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";
import {
  isQuickReviewArticle,
  validateQuickPublishContent,
  type PublishArticleFields,
} from "@/lib/articles/quickPublishGuards";
import {
  buildMakeArticleCustomId,
  parseCandidateButtonCustomId,
} from "@/lib/discord/allowlist";
import {
  buildMorningBriefPayload,
  formatMorningBriefMessageContent,
} from "@/lib/discord/morningBriefMessage";
import { handleDiscordComponentInteraction } from "@/lib/discord/handleInteractionCore";

const CANDIDATE_ID = "11111111-1111-4111-8111-111111111111";
const ARTICLE_ID = "22222222-2222-4222-8222-222222222222";
const GUILD_ID = "999999999999999999";
const USER_ID = "888888888888888888";

function baseArticle(
  partial: Partial<PublishArticleFields> = {}
): PublishArticleFields {
  return {
    id: ARTICLE_ID,
    published_at: null,
    title_original: "English title",
    body_original: "English body paragraph.",
    summary_original: "English summary.",
    title_translated: "한국어 제목",
    body_translated: "한국어 본문 첫 문단입니다.\n\n두 번째 문단입니다.",
    summary_translated: "한국어 요약입니다.",
    title_ko: "한국어 제목",
    summary_ko: "한국어 요약입니다.",
    review_status: "quick_review",
    status: "ready_for_human_review",
    is_published: false,
    ai_review_status: "warning",
    ai_review_notes: "짧은 기사",
    ...partial,
  };
}

describe("quick publish flow (fixture only, no OpenAI/Discord/publish)", () => {
  it("defines quick_review workflow distinct from pending review", () => {
    assert.equal(ARTICLE_WORKFLOW.quickReview.review_status, "quick_review");
    assert.equal(
      ARTICLE_WORKFLOW.quickReview.status,
      "ready_for_human_review"
    );
    assert.equal(ARTICLE_WORKFLOW.quickReview.is_published, false);
    assert.notEqual(
      ARTICLE_WORKFLOW.quickReview.review_status,
      ARTICLE_WORKFLOW.review.review_status
    );
    assert.equal(ARTICLE_WORKFLOW.published.is_published, true);
  });

  it("blocks quick publish when title/body/summary empty; warnings do not block", () => {
    const ok = validateQuickPublishContent(baseArticle());
    assert.equal(ok.ok, true);
    assert.ok(ok.warnings.length >= 1);

    const noTitle = validateQuickPublishContent(
      baseArticle({
        title_ko: "",
        title_translated: "",
        title_original: "",
      })
    );
    assert.equal(noTitle.ok, false);
    assert.ok(noTitle.errors.some((e) => e.includes("제목")));

    const noBody = validateQuickPublishContent(
      baseArticle({ body_translated: "", body_original: "" })
    );
    assert.equal(noBody.ok, false);

    const noSummary = validateQuickPublishContent(
      baseArticle({
        summary_ko: "",
        summary_translated: "",
        summary_original: "",
      })
    );
    assert.equal(noSummary.ok, false);
  });

  it("isQuickReviewArticle rejects published or pending", () => {
    assert.equal(isQuickReviewArticle(baseArticle()), true);
    assert.equal(
      isQuickReviewArticle(baseArticle({ review_status: "pending" })),
      false
    );
    assert.equal(
      isQuickReviewArticle(baseArticle({ is_published: true })),
      false
    );
  });

  it("Discord make-article custom id and deferred promote path", async () => {
    assert.equal(
      buildMakeArticleCustomId(CANDIDATE_ID),
      `cc:mk:${CANDIDATE_ID}`
    );
    const parsed = parseCandidateButtonCustomId(`cc:mk:${CANDIDATE_ID}`);
    assert.deepEqual(parsed, {
      action: "make_article",
      candidateId: CANDIDATE_ID,
    });

    let promoted = false;
    let edited: { content: string } | null = null;

    const result = await handleDiscordComponentInteraction(
      {
        type: 3,
        guild_id: GUILD_ID,
        member: { user: { id: USER_ID } },
        data: { custom_id: `cc:mk:${CANDIDATE_ID}` },
        token: "test-token",
        application_id: "app",
      },
      {
        allowedGuildId: GUILD_ID,
        allowedUserIds: new Set([USER_ID]),
        shortlist: async () => ({ ok: false, error: "unused" }),
        dismiss: async () => ({ ok: false, error: "unused" }),
        fetchCandidate: async () => ({
          id: CANDIDATE_ID,
          source: "ap",
          feedLabel: "AP",
          title: "Test headline",
          originalUrl: "https://apnews.com/x",
          rssPublishedAt: "2026-08-25T12:00:00.000Z",
          aiRecommendGrade: "best",
          aiRecommendScore: 90,
          aiRecommendReason: "reason",
        }),
        fetchStatus: async () => "pending",
        makeArticle: async () => {
          promoted = true;
          return { ok: true, articleId: ARTICLE_ID };
        },
        editOriginalMessage: async ({ content }) => {
          edited = { content };
          return { ok: true };
        },
      }
    );

    assert.equal(result.kind, "deferred_update");
    if (result.kind !== "deferred_update") return;
    await result.continueWork();
    assert.equal(promoted, true);
    assert.ok(edited?.content.includes("기사 생성 완료"));
    assert.ok(edited?.content.includes("빠른 검토"));
  });

  it("article_created payload exposes quick review link button", () => {
    const payload = buildMorningBriefPayload(
      {
        id: CANDIDATE_ID,
        source: "ap",
        feedLabel: "AP",
        title: "Headline",
        originalUrl: "https://apnews.com/x",
        rssPublishedAt: null,
        aiRecommendGrade: "best",
        aiRecommendScore: 90,
        aiRecommendReason: null,
      },
      "article_created",
      { articleId: ARTICLE_ID }
    );
    assert.match(
      formatMorningBriefMessageContent(
        {
          id: CANDIDATE_ID,
          source: "ap",
          feedLabel: "AP",
          title: "Headline",
          originalUrl: "https://apnews.com/x",
          rssPublishedAt: null,
          aiRecommendGrade: "best",
          aiRecommendScore: null,
          aiRecommendReason: null,
        },
        "article_created",
        { articleId: ARTICLE_ID }
      ),
      /기사 생성 완료/
    );
    const link = payload.components[0]?.components.find(
      (c) => "url" in c && c.style === 5
    );
    assert.ok(link && "url" in link);
    assert.match(String(link.url), /\/admin\/quick-review\//);
  });

  it("quickPublish + promote wiring avoid OpenAI on publish path", () => {
    const publishSrc = readFileSync(
      join(process.cwd(), "lib/articles/publishArticle.ts"),
      "utf8"
    );
    assert.match(publishSrc, /export async function quickPublishArticle/);
    assert.match(publishSrc, /publishArticleToLive/);
    assert.match(publishSrc, /upsertLocalizations/);
    assert.match(publishSrc, /requireReviewStatus/);
    assert.doesNotMatch(publishSrc, /from ["']@\/lib\/openai/);

    const promoteSrc = readFileSync(
      join(process.cwd(), "lib/collection-candidates/promoteCollectionCandidate.ts"),
      "utf8"
    );
    assert.match(promoteSrc, /landingWorkflow/);
    assert.match(promoteSrc, /quick_review/);

    const actionsSrc = readFileSync(
      join(process.cwd(), "app/admin/(app)/approved/actions.ts"),
      "utf8"
    );
    assert.match(actionsSrc, /publishApprovedArticleToLive/);

    const insertSrc = readFileSync(
      join(process.cwd(), "lib/articles/insertReviewQueueArticle.ts"),
      "utf8"
    );
    assert.match(insertSrc, /landingWorkflow/);
    assert.match(insertSrc, /quick_review/);
  });
});
