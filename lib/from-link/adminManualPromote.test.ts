/**
 * Admin manual source + force-create — fixture only (no OpenAI / DB).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ADMIN_FORCE_CREATE_NOTE,
  MANUAL_SOURCE_BODY_NOTE,
  buildManualPromoteNoteLines,
  canAllowAdminForceCreateSave,
  manualBodyClearsExtractionGate,
  notesIndicateAdminForceCreate,
  notesIndicateManualSourceBody,
  parseAdminForceCreateFlag,
  shouldRetryVerifiedManualAiDecision,
} from "@/lib/from-link/adminManualPromote";
import { MIN_USABLE_BODY_CHARS } from "@/lib/from-link/constants";
import {
  buildMorningBriefComponents,
  formatMorningBriefMessageContent,
  type MorningBriefItem,
} from "@/lib/discord/morningBriefMessage";
import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";

const briefItem: MorningBriefItem = {
  id: "cand-1",
  source: "chosun",
  feedLabel: "조선일보",
  title: "테스트 후보",
  originalUrl: "https://www.chosun.com/example",
  rssPublishedAt: "2026-08-25T12:00:00.000Z",
  aiRecommendGrade: "best",
  aiRecommendScore: 90,
  aiRecommendReason: "중요",
};

describe("admin manual promote (fixture only)", () => {
  it("retries an insufficient-material AI decision for verified manual body", () => {
    assert.equal(
      shouldRetryVerifiedManualAiDecision({
        manualBodyChars: 4_940,
        preferManualSourceBody: true,
        usable: false,
        reason: "본문 추출 실패: 자료 부족",
      }),
      true
    );
    assert.equal(
      shouldRetryVerifiedManualAiDecision({
        manualBodyChars: 4_940,
        preferManualSourceBody: true,
        usable: false,
        reason: "광고성 콘텐츠",
      }),
      false
    );
    assert.equal(
      shouldRetryVerifiedManualAiDecision({
        manualBodyChars: 399,
        preferManualSourceBody: true,
        usable: false,
        reason: "자료 부족",
      }),
      false
    );
  });
  it("extraction failure + manual body ≥400 clears gate without force", () => {
    assert.equal(
      manualBodyClearsExtractionGate({
        manualBodyChars: 420,
        adminForceCreate: false,
        minUsableChars: MIN_USABLE_BODY_CHARS,
      }),
      true
    );
  });

  it("manual 350 + force clears extraction; without force does not", () => {
    assert.equal(
      manualBodyClearsExtractionGate({
        manualBodyChars: 350,
        adminForceCreate: true,
        minUsableChars: MIN_USABLE_BODY_CHARS,
      }),
      true
    );
    assert.equal(
      manualBodyClearsExtractionGate({
        manualBodyChars: 350,
        adminForceCreate: false,
        minUsableChars: MIN_USABLE_BODY_CHARS,
      }),
      false
    );
  });

  it("empty textarea + force does not clear gate", () => {
    assert.equal(
      manualBodyClearsExtractionGate({
        manualBodyChars: 0,
        adminForceCreate: true,
        minUsableChars: MIN_USABLE_BODY_CHARS,
      }),
      false
    );
  });

  it("force soft-save allows length fails; rejects empty / promo", () => {
    assert.equal(
      canAllowAdminForceCreateSave(
        {
          ok: false,
          reason: "too short",
          failedCheckIds: ["body_ko_length"],
        },
        "가".repeat(350)
      ),
      true
    );
    assert.equal(
      canAllowAdminForceCreateSave(
        {
          ok: false,
          reason: "empty",
          failedCheckIds: ["body_ko_length"],
        },
        ""
      ),
      false
    );
    assert.equal(
      canAllowAdminForceCreateSave(
        {
          ok: false,
          reason: "promo",
          failedCheckIds: ["body_promotional"],
        },
        "가".repeat(350)
      ),
      false
    );
  });

  it("notes encode manual + force flags for quick review", () => {
    const lines = buildManualPromoteNoteLines({
      manualSourceBodyUsed: true,
      adminForceCreate: true,
      manualBodyChars: 350,
    });
    const notes = lines.join("\n");
    assert.ok(notesIndicateManualSourceBody(notes));
    assert.ok(notesIndicateAdminForceCreate(notes));
    assert.ok(notes.includes(MANUAL_SOURCE_BODY_NOTE));
    assert.ok(notes.includes(ADMIN_FORCE_CREATE_NOTE));
    assert.ok(parseAdminForceCreateFlag("true"));
  });

  it("Discord failure offers admin manual-input link", () => {
    const content = formatMorningBriefMessageContent(briefItem, "article_failed", {
      error: "본문 추출 실패",
    });
    assert.match(content, /관리자에서 원문 직접 입력 가능/);
    const components = buildMorningBriefComponents(
      briefItem.id,
      briefItem.originalUrl,
      "article_failed"
    );
    const link = components[0]?.components.find(
      (c) => c.type === 2 && "url" in c && c.style === 5
    );
    assert.ok(link && "url" in link);
    assert.match(String(link.url), /collection-candidates/);
    assert.match(String(link.label), /원문 직접 입력/);
  });

  it("force path has no length-regeneration / RSS auto stays strict", () => {
    const summarize = readFileSync(
      join(process.cwd(), "lib/from-link/summarizeForArticle.ts"),
      "utf8"
    );
    assert.doesNotMatch(summarize, /length_expand|from_link_summarize_length_expand/);
    const promote = readFileSync(
      join(process.cwd(), "lib/collection-candidates/promoteCollectionCandidate.ts"),
      "utf8"
    );
    assert.match(promote, /adminForceCreate/);
    assert.match(promote, /supplementalText/);
    const rss = readFileSync(
      join(process.cwd(), "lib/rss/enrichRssArticleFromLink.ts"),
      "utf8"
    );
    assert.doesNotMatch(rss, /adminForceCreate:\s*true/);
    assert.match(summarize, /admin_verified_manual_full_text/);
    assert.match(summarize, /from_link_summarize_verified_manual_retry/);
    assert.equal(
      (summarize.match(/from_link_summarize_verified_manual_retry/g) ?? [])
        .length,
      1
    );
    assert.equal(ARTICLE_WORKFLOW.quickReview.review_status, "quick_review");
  });

  it("landing stays quick_review / review workflow compatible", () => {
    const promote = readFileSync(
      join(process.cwd(), "lib/collection-candidates/promoteCollectionCandidate.ts"),
      "utf8"
    );
    assert.match(promote, /landingWorkflow/);
    assert.match(promote, /quick_review/);
  });
});
