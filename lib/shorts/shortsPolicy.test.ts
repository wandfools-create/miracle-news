import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isArticleRecommendedForDesk,
  isKoreaDeskArticle,
  validateShortsArticleCount,
} from "./shortsPolicy";

describe("Miracle News Shorts policy", () => {
  it("allows only 3 to 5 selected articles", () => {
    assert.equal(validateShortsArticleCount(2).ok, false);
    assert.equal(validateShortsArticleCount(3).ok, true);
    assert.equal(validateShortsArticleCount(5).ok, true);
    assert.equal(validateShortsArticleCount(6).ok, false);
  });

  it("routes Korean publishers to evening desk", () => {
    assert.equal(isKoreaDeskArticle({ source: "TV조선" }), true);
    assert.equal(isArticleRecommendedForDesk({ source: "인사이트" }, "evening"), true);
    assert.equal(isArticleRecommendedForDesk({ source: "AP" }, "morning"), true);
  });

  it("keeps Korea Herald in morning international desk", () => {
    assert.equal(
      isArticleRecommendedForDesk(
        { source: "The Korea Herald", source_country: "KR" },
        "morning"
      ),
      true
    );
  });
});
