import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPublishedArticleRow,
  parseShortsArticleIds,
  validateShortsSelectionInput,
  verifyPublishedArticleRows,
} from "./fetchPublishedArticlesForShorts";

describe("fetchPublishedArticlesForShorts helpers", () => {
  it("parses article id arrays and comma strings", () => {
    assert.deepEqual(parseShortsArticleIds(["a", "b"]), ["a", "b"]);
    assert.deepEqual(parseShortsArticleIds("a,b"), ["a", "b"]);
    assert.equal(parseShortsArticleIds([]), null);
  });

  it("enforces 3–5 article selection", () => {
    assert.equal(
      validateShortsSelectionInput({
        articleIds: ["1", "2"],
        desk: "morning",
        editDate: "2026-08-26",
      }).ok,
      false
    );
    assert.equal(
      validateShortsSelectionInput({
        articleIds: ["1", "2", "3"],
        desk: "evening",
        editDate: "2026-08-26",
      }).ok,
      true
    );
    assert.equal(
      validateShortsSelectionInput({
        articleIds: ["1", "2", "3", "4", "5", "6"],
        desk: "morning",
        editDate: "2026-08-26",
      }).ok,
      false
    );
  });

  it("detects unpublished rows", () => {
    assert.equal(
      isPublishedArticleRow({
        status: "published",
        review_status: "approved",
        is_published: true,
      }),
      true
    );
    assert.equal(
      isPublishedArticleRow({
        status: "draft",
        review_status: "approved",
        is_published: true,
      }),
      false
    );
  });

  it("requires exact published id match", () => {
    const rows = [
      {
        id: "a1",
        title_ko: "t",
        title_original: null,
        summary_ko: null,
        summary_original: null,
        source: null,
        published_at: null,
        source_country: null,
        body_translated: null,
        body_original: null,
        original_url: null,
        canonical_url: null,
        thumbnail_url: null,
      },
    ];
    const missing = verifyPublishedArticleRows(["a1", "a2"], rows);
    assert.equal(missing.ok, false);
    const ok = verifyPublishedArticleRows(["a1"], rows);
    assert.equal(ok.ok, true);
  });
});
