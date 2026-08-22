import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeArticleCategory,
  normalizeTopicKey,
  normalizeTopicLabel,
  parseEditorTaxonomy,
} from "./articleTaxonomy";

describe("articleTaxonomy", () => {
  it("normalizes category aliases and invalid values", () => {
    assert.equal(normalizeArticleCategory("international"), "world");
    assert.equal(normalizeArticleCategory("technology"), "other");
    assert.equal(normalizeArticleCategory("unknown"), "other");
  });

  it("normalizes topic key and label", () => {
    assert.equal(normalizeTopicKey("US Election 2026"), "us-election-2026");
    assert.equal(normalizeTopicKey("ab"), null);
    assert.equal(normalizeTopicLabel("  미국 대선  "), "미국 대선");
    assert.equal(normalizeTopicLabel("a"), null);
  });

  it("parses editor taxonomy fields", () => {
    const parsed = parseEditorTaxonomy({
      category: "politics",
      topic_key: "korea-election-2026",
      topic_label_ko: "한국 총선",
    });
    assert.deepEqual(parsed, {
      category: "politics",
      topicKey: "korea-election-2026",
      topicLabel: "한국 총선",
    });
  });
});
