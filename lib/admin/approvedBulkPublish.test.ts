import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  APPROVED_BULK_PAYLOAD_MAX_URL_CHARS,
  compactApprovedBulkPublishForUrl,
  encodeApprovedBulkPublishPayload,
  prioritizeBulkPublishResults,
  summarizeApprovedBulkPublish,
  type ApprovedBulkPublishItemResult,
} from "@/lib/admin/approvedBulkPublish";
import {
  APPROVED_BULK_PUBLISH_MAX_IDS,
  isValidArticleUuid,
  parseApprovedPublishArticleIds,
} from "@/lib/admin/approvedPublishIds";

function fail(
  id: string,
  step: string,
  error: string,
  excluded = false
): ApprovedBulkPublishItemResult {
  return { id, ok: false, step, error, excluded };
}

function ok(
  id: string,
  title: string,
  sameEvent = false
): ApprovedBulkPublishItemResult {
  return {
    id,
    ok: true,
    title,
    alreadyPublished: false,
    sameEventNote: sameEvent
      ? {
          id: "m1",
          title: "Match title",
          source: "ap",
          publishedAt: "2026-08-26T00:00:00.000Z",
          relation: "same_event",
        }
      : undefined,
  };
}

describe("approved bulk publish URL payload", () => {
  it("prioritizes failures and excluded before plain success", () => {
    const results: ApprovedBulkPublishItemResult[] = [
      ok("s1", "Success A"),
      fail("f1", "localizations", "missing ko"),
      ok("s2", "Success B", true),
      fail("e1", "excluded", "archived", true),
    ];
    const ordered = prioritizeBulkPublishResults(results);
    assert.equal(ordered[0]?.id, "f1");
    assert.equal(ordered[1]?.id, "e1");
    assert.equal(ordered[2]?.id, "s2");
    assert.equal(ordered[3]?.id, "s1");
  });

  it("keeps full counts when detail rows are truncated for URL budget", () => {
    const results: ApprovedBulkPublishItemResult[] = [
      fail("f1", "localizations", "err"),
      ...Array.from({ length: 55 }, (_, i) =>
        ok(`s${i}`, `Success number ${i} with a longer title for payload`)
      ),
    ];
    const full = summarizeApprovedBulkPublish(results);
    assert.equal(full.totalResultCount, 56);
    assert.equal(full.successCount, 55);
    assert.equal(full.failedCount, 1);

    const compact = compactApprovedBulkPublishForUrl(full);
    assert.equal(compact.successCount, 55);
    assert.equal(compact.failedCount, 1);
    assert.equal(compact.totalResultCount, 56);
    assert.ok(compact.displayedDetailCount < compact.totalResultCount);
    assert.ok(compact.results.some((r) => !r.ok && r.id === "f1"));

    const encoded = encodeApprovedBulkPublishPayload(full);
    const urlLen = `batchPublish=1&batchPayload=${encoded}`.length;
    assert.ok(urlLen <= APPROVED_BULK_PAYLOAD_MAX_URL_CHARS + 50);
  });

  it("dedupes IDs and rejects invalid UUIDs with server cap", () => {
    const valid = "11111111-1111-4111-8111-111111111111";
    const form = new FormData();
    form.append("articleIds", valid);
    form.append("articleIds", valid);
    form.append("articleIds", "not-a-uuid");
    for (let i = 0; i < APPROVED_BULK_PUBLISH_MAX_IDS + 5; i++) {
      form.append(
        "articleIds",
        `22222222-2222-4222-8222-${String(i).padStart(12, "0")}`
      );
    }
    const parsed = parseApprovedPublishArticleIds(form);
    assert.equal(parsed.invalidCount, 1);
    assert.equal(parsed.truncatedCount, 6);
    assert.equal(parsed.ids.length, APPROVED_BULK_PUBLISH_MAX_IDS);
    assert.ok(isValidArticleUuid(valid));
    assert.equal(isValidArticleUuid("bad"), false);
  });
});
