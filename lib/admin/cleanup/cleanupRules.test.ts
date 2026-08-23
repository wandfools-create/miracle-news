import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CLEANUP_RETENTION_DAYS,
  cleanupCutoffIso,
  isArchiveableReviewArticle,
  isExpireableCollectionCandidate,
} from "./cleanupRules";

describe("admin stale cleanup rules (fixture only)", () => {
  const now = new Date("2026-08-23T00:00:00.000Z");
  const cutoff = cleanupCutoffIso(now);

  it("uses 60-day retention", () => {
    assert.equal(CLEANUP_RETENTION_DAYS, 60);
    assert.equal(cutoff, "2026-06-24T00:00:00.000Z");
  });

  it("expires unused pending/enrich_failed/dismissed over 60d", () => {
    assert.equal(
      isExpireableCollectionCandidate(
        {
          status: "pending",
          article_id: null,
          created_at: "2026-05-01T00:00:00.000Z",
          rss_published_at: "2026-05-01T00:00:00.000Z",
        },
        cutoff
      ),
      true
    );
    assert.equal(
      isExpireableCollectionCandidate(
        {
          status: "enrich_failed",
          article_id: null,
          created_at: "2026-05-01T00:00:00.000Z",
        },
        cutoff
      ),
      true
    );
    assert.equal(
      isExpireableCollectionCandidate(
        {
          status: "dismissed",
          article_id: null,
          created_at: "2026-05-01T00:00:00.000Z",
        },
        cutoff
      ),
      true
    );
  });

  it("never expires candidates with article_id or enriched/protected", () => {
    assert.equal(
      isExpireableCollectionCandidate(
        {
          status: "pending",
          article_id: "art-1",
          created_at: "2026-05-01T00:00:00.000Z",
        },
        cutoff
      ),
      false
    );
    assert.equal(
      isExpireableCollectionCandidate(
        {
          status: "enriched",
          article_id: null,
          created_at: "2026-05-01T00:00:00.000Z",
        },
        cutoff
      ),
      false
    );
    assert.equal(
      isExpireableCollectionCandidate(
        {
          status: "pending",
          article_id: null,
          created_at: "2026-08-20T00:00:00.000Z",
        },
        cutoff
      ),
      false
    );
  });

  it("archives only stale unpublished review-pending articles", () => {
    assert.equal(
      isArchiveableReviewArticle(
        {
          status: "ready_for_human_review",
          review_status: "pending",
          is_published: false,
          is_top_story: false,
          collected_at: "2026-05-28T00:00:00.000Z",
          created_at: "2026-05-28T00:00:00.000Z",
        },
        cutoff
      ),
      true
    );
  });

  it("never archives published / approved / hold / revision / top story", () => {
    const base = {
      collected_at: "2026-05-01T00:00:00.000Z",
      created_at: "2026-05-01T00:00:00.000Z",
      is_published: false,
      is_top_story: false,
    };
    assert.equal(
      isArchiveableReviewArticle(
        {
          ...base,
          status: "published",
          review_status: "approved",
          is_published: true,
        },
        cutoff
      ),
      false
    );
    assert.equal(
      isArchiveableReviewArticle(
        {
          ...base,
          status: "approved",
          review_status: "approved",
        },
        cutoff
      ),
      false
    );
    assert.equal(
      isArchiveableReviewArticle(
        {
          ...base,
          status: "ready_for_human_review",
          review_status: "on_hold",
        },
        cutoff
      ),
      false
    );
    assert.equal(
      isArchiveableReviewArticle(
        {
          ...base,
          status: "needs_revision",
          review_status: "needs_revision",
        },
        cutoff
      ),
      false
    );
    assert.equal(
      isArchiveableReviewArticle(
        {
          ...base,
          status: "ready_for_human_review",
          review_status: "pending",
          is_top_story: true,
        },
        cutoff
      ),
      false
    );
    assert.equal(
      isArchiveableReviewArticle(
        {
          status: "ready_for_human_review",
          review_status: "pending",
          is_published: false,
          is_top_story: false,
          collected_at: "2026-08-20T00:00:00.000Z",
          created_at: "2026-08-20T00:00:00.000Z",
        },
        cutoff
      ),
      false
    );
  });
});
