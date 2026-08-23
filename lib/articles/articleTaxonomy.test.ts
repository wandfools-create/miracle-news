import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { KOREAN_EDITOR_JSON_SYSTEM_PROMPT } from "./ai/editorPrompt";
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

  it("parses editor taxonomy fields including editorial_priority", () => {
    const parsed = parseEditorTaxonomy({
      category: "politics",
      topic_key: "korea-election-2026",
      topic_label_ko: "한국 총선",
      editorial_priority: "issue",
    });
    assert.deepEqual(parsed, {
      category: "politics",
      topicKey: "korea-election-2026",
      topicLabel: "한국 총선",
      editorialPriority: "issue",
    });
  });

  it("defaults ambiguous or invalid editorial_priority to normal", () => {
    assert.equal(
      parseEditorTaxonomy({ editorial_priority: "urgent" }).editorialPriority,
      "normal"
    );
    assert.equal(parseEditorTaxonomy({}).editorialPriority, "normal");
    assert.equal(
      parseEditorTaxonomy({ editorial_priority: "BREAKING" }).editorialPriority,
      "breaking"
    );
    assert.equal(
      parseEditorTaxonomy({ editorialPriority: "special" }).editorialPriority,
      "special"
    );
  });

  it("prompt schema documents editorial_priority in the same OpenAI JSON call", () => {
    assert.match(KOREAN_EDITOR_JSON_SYSTEM_PROMPT, /editorial_priority/);
    assert.match(KOREAN_EDITOR_JSON_SYSTEM_PROMPT, /"breaking"/);
    assert.match(KOREAN_EDITOR_JSON_SYSTEM_PROMPT, /Do not overuse breaking/);
    assert.match(KOREAN_EDITOR_JSON_SYSTEM_PROMPT, /Default to normal/);
  });
});
