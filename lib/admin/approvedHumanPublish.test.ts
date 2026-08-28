import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  decodeApprovedBulkPublishPayload,
  encodeApprovedBulkPublishPayload,
  summarizeApprovedBulkPublish,
  type ApprovedBulkPublishItemResult,
} from "@/lib/admin/approvedBulkPublish";
import {
  approvedPublishExclusionReason,
  isApprovedReadyForHumanPublish,
} from "@/lib/articles/approvedPublishPolicy";
import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const approvedRow = {
  id: "a1",
  status: ARTICLE_WORKFLOW.approved.status,
  review_status: ARTICLE_WORKFLOW.approved.review_status,
  is_published: ARTICLE_WORKFLOW.approved.is_published,
};

describe("approved human publish policy", () => {
  it("allows approved + not published for human publish", () => {
    assert.equal(isApprovedReadyForHumanPublish(approvedRow), true);
    assert.equal(approvedPublishExclusionReason(approvedRow), null);
  });

  it("treats already published as idempotent ready", () => {
    const row = {
      ...approvedRow,
      is_published: true,
      status: ARTICLE_WORKFLOW.published.status,
    };
    assert.equal(isApprovedReadyForHumanPublish(row), true);
    assert.equal(approvedPublishExclusionReason(row), null);
  });

  it("rejects quick_review, archived, rejected, and needs_revision", () => {
    const quick = {
      id: "q1",
      status: ARTICLE_WORKFLOW.quickReview.status,
      review_status: ARTICLE_WORKFLOW.quickReview.review_status,
      is_published: false,
    };
    assert.equal(isApprovedReadyForHumanPublish(quick), false);
    assert.match(approvedPublishExclusionReason(quick)!, /quick_review/);

    const archived = {
      id: "x1",
      status: ARTICLE_WORKFLOW.archived.status,
      review_status: ARTICLE_WORKFLOW.archived.review_status,
      is_published: false,
    };
    assert.match(approvedPublishExclusionReason(archived)!, /보관/);

    const rejected = {
      id: "r1",
      status: ARTICLE_WORKFLOW.rejected.status,
      review_status: ARTICLE_WORKFLOW.rejected.review_status,
      is_published: false,
    };
    assert.match(approvedPublishExclusionReason(rejected)!, /반려/);

    const revision = {
      id: "v1",
      status: ARTICLE_WORKFLOW.revision.status,
      review_status: ARTICLE_WORKFLOW.revision.review_status,
      is_published: false,
    };
    assert.match(approvedPublishExclusionReason(revision)!, /수정 대기/);
  });

  it("summarizes bulk publish results without aborting on excluded vs failed", () => {
    const results: ApprovedBulkPublishItemResult[] = [
      {
        id: "1",
        ok: true,
        title: "A",
        alreadyPublished: false,
        sameEventNote: {
          id: "m1",
          title: "Match",
          source: "ap",
          publishedAt: "2026-08-26T00:00:00.000Z",
        },
      },
      { id: "2", ok: true, title: "B", alreadyPublished: true },
      {
        id: "3",
        ok: false,
        step: "excluded",
        error: "보관",
        excluded: true,
      },
      {
        id: "4",
        ok: false,
        step: "localizations",
        error: "missing ko",
      },
    ];

    const summary = summarizeApprovedBulkPublish(results);
    assert.equal(summary.successCount, 2);
    assert.equal(summary.sameEventPublishedCount, 1);
    assert.equal(summary.excludedCount, 1);
    assert.equal(summary.failedCount, 1);
    assert.equal(summary.totalResultCount, 4);

    const encoded = encodeApprovedBulkPublishPayload(summary);
    const decoded = decodeApprovedBulkPublishPayload(encoded);
    assert.deepEqual(decoded?.successCount, 2);
    assert.equal(decoded?.totalResultCount, 4);
  });
});

describe("approved human publish wiring (fixture only)", () => {
  it("bulk publish loops all IDs and redirects only after loop completes", () => {
    const actions = read("app/admin/(app)/approved/actions.ts");
    assert.match(actions, /for \(const articleId of articleIds\)/);
    assert.match(actions, /publishApprovedArticleToLive/);
    assert.match(actions, /encodeApprovedBulkPublishPayload/);
    const bulkFn = actions.match(
      /export async function bulkPublishArticles[\s\S]*$/
    )?.[0];
    assert.ok(bulkFn);
    const loopBody = bulkFn!.match(
      /for \(const articleId of articleIds\) \{([\s\S]*?)\n  \}\n\n  const authClient/
    )?.[1];
    assert.ok(loopBody);
    assert.doesNotMatch(loopBody!, /redirect\(/);
    assert.doesNotMatch(actions, /allowSameEventOverride/);
    assert.doesNotMatch(actions, /humanApprovedPublish/);
  });

  it("approved actions require admin and dedicated publish entry point", () => {
    const actions = read("app/admin/(app)/approved/actions.ts");
    assert.match(actions, /requireAdmin/);
    assert.match(actions, /publishArticleFromForm/);
    assert.match(actions, /publishApprovedArticleToLive/);
    assert.doesNotMatch(
      actions,
      /throw new Error\(\s*`유사한 공개 기사가 있습니다/
    );

    const page = read("app/admin/(app)/approved/page.tsx");
    assert.match(page, /ApprovedBulkPublishResult/);
    assert.doesNotMatch(page, /그래도 공개 \(관리자 override\)/);
    assert.doesNotMatch(page, /allowSameEventOverride/);
  });

  it("publishApprovedArticleToLive is the only approved human publish export", () => {
    const publishApproved = read("lib/articles/publishApprovedArticle.ts");
    assert.match(publishApproved, /publishArticleToLiveInternal/);
    assert.match(publishApproved, /approvedHumanPublish:\s*true/);

    const quick = read("app/admin/(app)/quick-review/actions.ts");
    assert.match(quick, /allowSameEventOverride/);
    assert.doesNotMatch(quick, /publishApprovedArticleToLive/);
  });

  it("publishArticleToLive still hard-blocks same_event without approved path", () => {
    const publish = read("lib/articles/publishArticle.ts");
    assert.match(publish, /step: "same_event_guard"/);
    assert.match(publish, /approvedHumanPublish/);
    assert.match(publish, /sameEventPublishResultMetadata/);
    assert.doesNotMatch(publish, /humanApprovedPublish/);
  });
});
