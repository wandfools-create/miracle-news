/**
 * Admin soft-discard rules — fixture only (no DB / OpenAI).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";
import {
  buildDiscardArticleUpdate,
  buildRestoreDiscardedArticleUpdate,
  discardConfirmMessage,
  evaluateDiscardEligibility,
  evaluateRestoreEligibility,
  isExcludedFromWorkQueues,
  isVisibleOnPublishedList,
  partitionDiscardCandidates,
} from "@/lib/admin/discardArticles";

describe("admin article discard (fixture only)", () => {
  it("discards on-hold article to archived without DELETE", () => {
    const hold = {
      id: "h1",
      status: "ready_for_human_review",
      review_status: "on_hold",
      is_published: false,
    };
    assert.equal(evaluateDiscardEligibility(hold).ok, true);
    assert.deepEqual(buildDiscardArticleUpdate(), {
      status: "archived",
      review_status: "archived",
      is_published: false,
    });
    assert.equal(ARTICLE_WORKFLOW.archived.status, "archived");

    const after = {
      ...hold,
      ...buildDiscardArticleUpdate(),
    };
    assert.equal(isExcludedFromWorkQueues(after), true);
    assert.equal(isVisibleOnPublishedList(after), false);
    assert.equal(evaluateDiscardEligibility(after).ok, false);
  });

  it("discards needs_revision article to archived", () => {
    const rev = {
      id: "r1",
      status: "needs_revision",
      review_status: "needs_revision",
      is_published: false,
    };
    assert.equal(evaluateDiscardEligibility(rev).ok, true);
    const after = { ...rev, ...buildDiscardArticleUpdate() };
    assert.equal(after.review_status, "archived");
    assert.equal(isExcludedFromWorkQueues(after), true);
  });

  it("bulk partition: 7 discardable + published blocked", () => {
    const rows = [
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `hold-${i}`,
        status: "ready_for_human_review",
        review_status: "on_hold" as const,
        is_published: false,
      })),
      {
        id: "pub-1",
        status: "published",
        review_status: "approved",
        is_published: true,
      },
      {
        id: "pending-1",
        status: "ready_for_human_review",
        review_status: "pending",
        is_published: false,
      },
    ];
    const { discardable, blocked } = partitionDiscardCandidates(rows);
    assert.equal(discardable.length, 7);
    assert.equal(blocked.length, 2);
    assert.ok(
      blocked.some(
        (b) => b.id === "pub-1" && b.blockReason.reason === "published"
      )
    );
    assert.ok(
      blocked.some(
        (b) =>
          b.id === "pending-1" &&
          b.blockReason.reason === "not_discardable_queue"
      )
    );
  });

  it("excludes discarded from work queues and published list", () => {
    const discarded = {
      status: "archived",
      review_status: "archived",
      is_published: false,
    };
    assert.equal(isExcludedFromWorkQueues(discarded), true);
    assert.equal(isVisibleOnPublishedList(discarded), false);

    const live = {
      status: "published",
      review_status: "approved",
      is_published: true,
    };
    assert.equal(isExcludedFromWorkQueues(live), false);
    assert.equal(isVisibleOnPublishedList(live), true);
  });

  it("restores archived to pending review — never publish/approve", () => {
    const archived = {
      id: "a1",
      status: "archived",
      review_status: "archived",
      is_published: false,
    };
    assert.equal(evaluateRestoreEligibility(archived).ok, true);
    const restored = buildRestoreDiscardedArticleUpdate();
    assert.equal(restored.status, "ready_for_human_review");
    assert.equal(restored.review_status, "pending");
    assert.equal(restored.is_published, false);
    assert.notEqual(restored.status, "published");
    assert.notEqual(restored.review_status, "approved");
  });

  it("blocks discard of published articles", () => {
    const published = {
      id: "p1",
      status: "published",
      review_status: "approved",
      is_published: true,
    };
    const result = evaluateDiscardEligibility(published);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "published");

    const statusOnly = {
      id: "p2",
      status: "published",
      review_status: "approved",
      is_published: false,
    };
    assert.equal(evaluateDiscardEligibility(statusOnly).ok, false);
  });

  it("confirm message mentions count once", () => {
    assert.match(discardConfirmMessage(7), /선택한 기사 7건을 폐기/);
    assert.match(discardConfirmMessage(7), /기본 작업 목록에서 제외/);
  });

  it("core uses service role + treats update count=0 as error", () => {
    const core = readFileSync(
      join(process.cwd(), "lib/admin/discardArticlesCore.ts"),
      "utf8"
    );
    assert.match(core, /createServiceRoleSupabaseClient/);
    assert.match(core, /update_zero/);
    assert.match(core, /discardedCount === 0/);
    assert.doesNotMatch(core, /\.delete\(/);
    assert.match(core, /archived/);
    assert.match(core, /on_hold/);
    assert.match(core, /needs_revision/);

    const actions = readFileSync(
      join(process.cwd(), "app/admin/(app)/discard/actions.ts"),
      "utf8"
    );
    assert.match(actions, /discardArticlesCore/);
    assert.match(actions, /isAllowedAdminEmail/);
    assert.match(actions, /articleIdsCsv/);

    const button = readFileSync(
      join(process.cwd(), "components/admin/DiscardArticlesButton.tsx"),
      "utf8"
    );
    assert.match(button, /discardArticlesByIdsAction/);
    assert.match(button, /articleIdsCsv/);
    assert.match(button, /router\.refresh/);
  });
});
