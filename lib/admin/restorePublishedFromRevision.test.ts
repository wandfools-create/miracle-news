/**
 * Fixture tests for restore-published-from-revision (no DB / OpenAI).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";
import {
  FORWARD_SEND_TO_REVISION_FIELDS,
  RESTORE_PRESERVED_AI_KEYS,
  RESTORE_PRESERVED_CONTENT_KEYS,
  RESTORE_PUBLISHED_CONFIRM,
  REVISION_METADATA_CLEAR_FIELDS,
  buildRestorePublishedFromRevisionUpdate,
  evaluateRestorePublishedEligibility,
  restorePublishedConfirmMessage,
  restorePublishedFailReasonLabel,
  restorePublishedPatchTouchesAiFields,
  restorePublishedPatchTouchesContent,
  summarizeRestoreItemOutcomes,
} from "@/lib/admin/restorePublishedFromRevision";

const baseEligible = {
  id: "a1",
  status: "needs_revision",
  review_status: "needs_revision",
  revision_status: "requested",
  is_published: false,
  published_at: "2026-08-25T12:00:00.000Z",
  hasKoLocalization: true,
  hasEnLocalization: true,
};

describe("restore published from revision (fixture only)", () => {
  it("documents exact forward send-to-revision fields", () => {
    const publishedActions = readFileSync(
      join(process.cwd(), "app/admin/(app)/published/actions.ts"),
      "utf8"
    );
    const fnSlice = publishedActions.slice(
      publishedActions.indexOf("async function sendArticleToRevisionById")
    );
    const updateBlock = fnSlice.slice(0, fnSlice.indexOf("async function setMainNewsById"));
    for (const field of FORWARD_SEND_TO_REVISION_FIELDS) {
      assert.match(updateBlock, new RegExp(field));
    }
    assert.doesNotMatch(updateBlock, /revision_request|ai_review_status|published_at/);
    assert.deepEqual([...FORWARD_SEND_TO_REVISION_FIELDS], [
      "status",
      "review_status",
      "revision_status",
      "is_published",
    ]);
  });

  it("allows previously published revision article", () => {
    assert.equal(evaluateRestorePublishedEligibility(baseEligible).ok, true);
  });

  it("rejects when revision_status is not requested", () => {
    const result = evaluateRestorePublishedEligibility({
      ...baseEligible,
      revision_status: "none",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_in_revision");
  });

  it("rejects article with no publish history", () => {
    const result = evaluateRestorePublishedEligibility({
      ...baseEligible,
      published_at: null,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_publish_history");
  });

  it("rejects archived article", () => {
    const result = evaluateRestorePublishedEligibility({
      ...baseEligible,
      status: "archived",
      review_status: "archived",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "archived");
  });

  it("rejects missing localization", () => {
    const result = evaluateRestorePublishedEligibility({
      ...baseEligible,
      hasEnLocalization: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "missing_localization");
  });

  it("rejects article not currently in revision", () => {
    const result = evaluateRestorePublishedEligibility({
      ...baseEligible,
      status: "ready_for_human_review",
      review_status: "pending",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_in_revision");
  });

  it("rejects already published article", () => {
    const result = evaluateRestorePublishedEligibility({
      ...baseEligible,
      status: "published",
      review_status: "approved",
      is_published: true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "already_published");
  });

  it("clears revision request metadata and reverses forward status fields", () => {
    const patch = buildRestorePublishedFromRevisionUpdate();
    assert.equal(patch.status, ARTICLE_WORKFLOW.published.status);
    assert.equal(patch.review_status, ARTICLE_WORKFLOW.published.review_status);
    assert.equal(patch.is_published, true);
    assert.equal(patch.revision_status, "none");
    assert.equal(patch.revision_request, null);
    assert.equal(patch.revision_result_notes, null);
    for (const key of REVISION_METADATA_CLEAR_FIELDS) {
      assert.equal(Object.prototype.hasOwnProperty.call(patch, key), true);
    }
    assert.equal(restorePublishedPatchTouchesContent(patch), false);
    assert.equal(restorePublishedPatchTouchesAiFields(patch), false);
    for (const key of RESTORE_PRESERVED_CONTENT_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(patch, key), false);
    }
    for (const key of RESTORE_PRESERVED_AI_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(patch, key), false);
    }
  });

  it("preserves content, published_at, and AI fields after restore merge", () => {
    const before = {
      ...baseEligible,
      title_ko: "제목",
      summary_ko: "요약",
      body_translated: "본문",
      thumbnail_url: "https://example.com/t.jpg",
      published_at: "2026-08-25T12:00:00.000Z",
      ai_review_status: "pending",
      ai_review_notes: "기존 AI 노트 보존",
      revision_request: "번역 이상",
      revision_result_notes: "임시",
    };
    const after = { ...before, ...buildRestorePublishedFromRevisionUpdate() };
    assert.equal(after.published_at, before.published_at);
    assert.equal(after.title_ko, before.title_ko);
    assert.equal(after.summary_ko, before.summary_ko);
    assert.equal(after.body_translated, before.body_translated);
    assert.equal(after.thumbnail_url, before.thumbnail_url);
    assert.equal(after.ai_review_status, "pending");
    assert.equal(after.ai_review_notes, "기존 AI 노트 보존");
    assert.equal(after.revision_request, null);
    assert.equal(after.revision_result_notes, null);
    assert.equal(after.is_published, true);
    assert.equal(after.status, "published");
  });

  it("summarizes mixed 50-item bulk outcomes", () => {
    const items = [
      ...Array.from({ length: 47 }, () => ({ ok: true as const })),
      { ok: false as const, reason: "no_publish_history" },
      { ok: false as const, reason: "missing_localization" },
      { ok: false as const, reason: "update_failed" },
    ];
    assert.equal(items.length, 50);
    const summary = summarizeRestoreItemOutcomes(items);
    assert.deepEqual(summary, {
      successCount: 47,
      skippedCount: 2,
      failedCount: 1,
    });
  });

  it("confirm message matches required copy", () => {
    assert.match(RESTORE_PUBLISHED_CONFIRM, /AI 수정 없이/);
    assert.match(RESTORE_PUBLISHED_CONFIRM, /기존 공개 내용 그대로/);
    assert.match(restorePublishedConfirmMessage(50), /50/);
  });

  it("fail reason labels are human readable", () => {
    assert.match(
      restorePublishedFailReasonLabel("no_publish_history"),
      /공개 이력/
    );
    assert.match(restorePublishedFailReasonLabel("archived"), /폐기/);
  });

  it("core never deletes audit logs and does not touch AI fields", () => {
    const core = readFileSync(
      join(process.cwd(), "lib/admin/restorePublishedFromRevisionCore.ts"),
      "utf8"
    );
    assert.doesNotMatch(core, /\.delete\(/);
    assert.doesNotMatch(core, /article_revision_logs/);
    assert.doesNotMatch(core, /ai_review_status|ai_review_notes/);
    assert.match(core, /revision_status", "requested"/);
    assert.match(core, /buildRestorePublishedFromRevisionUpdate/);
    assert.doesNotMatch(
      core,
      /from ["']openai|reviseArticleWithFeedback|publishArticleToLive|OPENAI_API_KEY/
    );
  });

  it("core and UI wire restore without OpenAI / publishArticleToLive", () => {
    const actions = readFileSync(
      join(process.cwd(), "app/admin/(app)/revision/actions.ts"),
      "utf8"
    );
    const button = readFileSync(
      join(
        process.cwd(),
        "components/admin/RestorePublishedFromRevisionButton.tsx"
      ),
      "utf8"
    );
    const publishedActions = readFileSync(
      join(process.cwd(), "app/admin/(app)/published/actions.ts"),
      "utf8"
    );

    assert.match(actions, /restorePublishedFromRevisionCore/);
    assert.match(actions, /requireAdmin|isAllowedAdminEmail/);

    const restoreActionSlice = actions.slice(
      actions.indexOf("restorePublishedFromRevisionByIdsAction")
    );
    assert.doesNotMatch(
      restoreActionSlice.slice(0, 800),
      /reviseArticleWithFeedback|runEditorialReview|publishArticleToLive|OPENAI_API_KEY/
    );
    assert.match(button, /RESTORE_PUBLISHED_CONFIRM|restorePublishedConfirmMessage/);
    assert.match(button, /restorePublishedFromRevisionByIdsAction/);

    assert.match(
      readFileSync(
        join(
          process.cwd(),
          "app/admin/(app)/published/PublishedArticlesManager.tsx"
        ),
        "utf8"
      ),
      /window\.confirm/
    );
    assert.match(publishedActions, /bulkSendToRevisionFromPublished/);
  });

  it("revalidate targets include public and revision paths", () => {
    const actions = readFileSync(
      join(process.cwd(), "app/admin/(app)/revision/actions.ts"),
      "utf8"
    );
    assert.match(actions, /revalidatePath\("\/admin\/revision"\)/);
    assert.match(actions, /revalidatePath\("\/admin\/published"\)/);
    assert.match(actions, /revalidatePath\("\/ko"\)/);
    assert.match(actions, /revalidatePath\("\/en"\)/);
  });
});
