/**
 * Revision queue AI policy — fixture only (no OpenAI / DB / Discord).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  AI_REVISION_COST_CONFIRM,
  aiRevisionBusyLabel,
  buildRequestRevisionArticlePatch,
  isAiRevisionProcessingStatus,
  requestRevisionPatchTouchesContent,
  REVISION_PRESERVED_CONTENT_KEYS,
  shouldAutoRunAiOnRevisionPageLoad,
} from "./revisionAiPolicy";

describe("revision AI policy (fixture only, no OpenAI)", () => {
  it("status-only patch never touches article content fields", () => {
    const patch = buildRequestRevisionArticlePatch("제목 다시 다듬기");
    assert.equal(patch.status, "needs_revision");
    assert.equal(patch.review_status, "needs_revision");
    assert.equal(patch.revision_status, "requested");
    assert.equal(patch.is_published, false);
    assert.equal(patch.revision_request, "제목 다시 다듬기");
    assert.equal(requestRevisionPatchTouchesContent(patch), false);
    for (const key of REVISION_PRESERVED_CONTENT_KEYS) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(patch, key),
        false,
        `must not set ${key}`
      );
    }
  });

  it("page load never auto-runs AI", () => {
    assert.equal(shouldAutoRunAiOnRevisionPageLoad(), false);
  });

  it("busy label only when AI request is pending", () => {
    assert.equal(aiRevisionBusyLabel(false), "AI로 수정");
    assert.equal(aiRevisionBusyLabel(true), "OpenAI 수정 중…");
    assert.equal(isAiRevisionProcessingStatus("processing"), true);
    assert.equal(isAiRevisionProcessingStatus("pending"), false);
    assert.equal(isAiRevisionProcessingStatus("pass"), false);
  });

  it("confirm copy mentions OpenAI cost", () => {
    assert.match(AI_REVISION_COST_CONFIRM, /OpenAI API 비용/);
  });

  it("review → revision entry wiring avoids OpenAI", () => {
    const actions = readFileSync(
      join(process.cwd(), "app/admin/(app)/review/[id]/actions.ts"),
      "utf8"
    );
    assert.match(actions, /buildRequestRevisionArticlePatch/);
    assert.doesNotMatch(
      actions,
      /reviseArticleWithFeedback/
    );
    // requestRevisionWithAi must not call OpenAI anymore
    const withAiFn = actions.slice(
      actions.indexOf("export async function requestRevisionWithAi")
    );
    assert.doesNotMatch(withAiFn, /reviseArticleWithFeedback/);
    assert.doesNotMatch(withAiFn, /chatCompletion/);

    const form = readFileSync(
      join(process.cwd(), "components/admin/ReviewRevisionForm.tsx"),
      "utf8"
    );
    assert.match(form, /requestRevision/);
    assert.doesNotMatch(form, /requestRevisionWithAi/);
    assert.doesNotMatch(form, /reviseArticle/);
  });

  it("revision page load / refresh wiring avoids auto OpenAI", () => {
    const ui = readFileSync(
      join(process.cwd(), "components/admin/RevisionArticleActions.tsx"),
      "utf8"
    );
    assert.doesNotMatch(ui, /useEffect/);
    assert.doesNotMatch(ui, /autoRunAi/);
    assert.doesNotMatch(ui, /autoStarted/);
    assert.match(ui, /AI_REVISION_COST_CONFIRM/);
    assert.match(ui, /runAiRevisionForArticle/);
    assert.match(ui, /saveManualRevisionEdit/);
    assert.match(ui, /직접 수정/);
    assert.match(ui, /aiRevisionBusyLabel/);

    const page = readFileSync(
      join(process.cwd(), "app/admin/(app)/revision/page.tsx"),
      "utf8"
    );
    assert.doesNotMatch(page, /reviseArticleWithFeedback/);
    assert.doesNotMatch(page, /runAiRevisionForArticle/);
    assert.match(page, /OpenAI는 호출되지 않습니다/);

    const revisionActions = readFileSync(
      join(process.cwd(), "app/admin/(app)/revision/actions.ts"),
      "utf8"
    );
    assert.match(revisionActions, /ai_review_status: "processing"/);
    assert.match(revisionActions, /isAiRevisionProcessingStatus/);
    assert.match(revisionActions, /saveManualRevisionEdit/);
    // AI rewrite only inside runAiRevisionForArticle — not on module import side effects
    assert.match(revisionActions, /export async function runAiRevisionForArticle/);
    assert.ok(
      revisionActions.indexOf("reviseArticleWithFeedback({") >
        revisionActions.indexOf("export async function runAiRevisionForArticle")
    );
  });

  it("published → revision status path has no OpenAI import", () => {
    const published = readFileSync(
      join(process.cwd(), "app/admin/(app)/published/actions.ts"),
      "utf8"
    );
    assert.doesNotMatch(published, /openai/i);
    assert.doesNotMatch(published, /reviseArticle/);
    assert.match(published, /sendArticleToRevisionById/);
  });

  it("preserves content keys list covers title/summary/body/thumbnail", () => {
    assert.ok(REVISION_PRESERVED_CONTENT_KEYS.includes("title_ko"));
    assert.ok(REVISION_PRESERVED_CONTENT_KEYS.includes("summary_ko"));
    assert.ok(REVISION_PRESERVED_CONTENT_KEYS.includes("body_translated"));
    assert.ok(REVISION_PRESERVED_CONTENT_KEYS.includes("thumbnail_url"));
  });
});
