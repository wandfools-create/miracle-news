import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateDuplicateAngle } from "@/lib/duplicate/evaluateDuplicateAngle";

describe("evaluateDuplicateAngle", () => {
  it("hard blocks exact original_url duplicates", () => {
    const result = evaluateDuplicateAngle({
      originalUrl: "https://example.com/a",
      source: "ap",
      title: "Title",
      existingByUrl: {
        id: "art-1",
        source: "ap",
        title: "Existing",
      },
      publishedPool: [],
    });
    assert.equal(result.hardBlock, true);
    assert.equal(result.class, "exact-original-url");
  });

  it("allows cross-outlet same event without override", () => {
    const result = evaluateDuplicateAngle({
      originalUrl: "https://example.com/b",
      source: "bbc",
      title: "President announces new housing policy for middle class",
      summary: "White House detailed mortgage relief and zoning incentives today.",
      publishedPool: [
        {
          id: "pub-1",
          source: "ap",
          title: "Biden unveils housing policy for middle class",
          summary:
            "White House detailed mortgage relief and zoning incentives today.",
        },
      ],
    });
    assert.equal(result.hardBlock, false);
    assert.equal(result.requiresOverride, false);
  });
});
