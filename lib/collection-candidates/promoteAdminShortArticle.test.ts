import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("admin promote short-article wiring (fixture / source scan)", () => {
  it("promoteCollectionCandidate enables adminArticleCreate", () => {
    const src = readFileSync(
      join(import.meta.dirname, "promoteCollectionCandidate.ts"),
      "utf8"
    );
    assert.match(src, /adminArticleCreate:\s*true/);
  });

  it("RSS auto pipeline keeps adminArticleCreate off by default", () => {
    const pipeline = readFileSync(
      join(import.meta.dirname, "..", "rss", "runRssFromLinkPipeline.ts"),
      "utf8"
    );
    const enrich = readFileSync(
      join(import.meta.dirname, "..", "rss", "enrichRssArticleFromLink.ts"),
      "utf8"
    );
    assert.match(pipeline, /adminArticleCreate/);
    assert.doesNotMatch(enrich, /adminArticleCreate:\s*true/);
  });
});
