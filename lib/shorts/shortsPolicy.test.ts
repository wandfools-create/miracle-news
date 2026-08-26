import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAmericaNewYorkDateKey } from "@/lib/cron/americaNewYork";
import {
  isArticleRecommendedForDesk,
  isKoreaDeskArticle,
  resolveShortsSourceKey,
  validateShortsArticleCount,
} from "./shortsPolicy";

describe("Miracle News Shorts policy", () => {
  it("allows only 3 to 5 selected articles", () => {
    assert.equal(validateShortsArticleCount(2).ok, false);
    assert.equal(validateShortsArticleCount(3).ok, true);
    assert.equal(validateShortsArticleCount(5).ok, true);
    assert.equal(validateShortsArticleCount(6).ok, false);
  });

  it("routes Korea desk source keys to evening", () => {
    assert.equal(resolveShortsSourceKey({ source: "TV조선" }), "tvchosun");
    assert.equal(isKoreaDeskArticle({ source: "tvchosun" }), true);
    assert.equal(isArticleRecommendedForDesk({ source: "insight" }, "evening"), true);
    assert.equal(isArticleRecommendedForDesk({ source: "ap" }, "morning"), true);
    assert.equal(isArticleRecommendedForDesk({ source: "chosun" }, "morning"), false);
  });

  it("keeps Korea Herald on morning US/International desk", () => {
    assert.equal(resolveShortsSourceKey({ source: "The Korea Herald" }), "korea-herald");
    assert.equal(isKoreaDeskArticle({ source: "The Korea Herald", source_country: "KR" }), false);
    assert.equal(
      isArticleRecommendedForDesk(
        { source: "The Korea Herald", source_country: "KR" },
        "morning"
      ),
      true
    );
    assert.equal(
      isArticleRecommendedForDesk(
        { source: "The Korea Herald", source_country: "KR" },
        "evening"
      ),
      false
    );
  });

  it("uses America/New_York date keys for Shorts edit date (DST)", () => {
    // 2026-03-08 04:30 UTC = 2026-03-07 23:30 EST (still previous NY calendar day)
    assert.equal(
      formatAmericaNewYorkDateKey("2026-03-08T04:30:00.000Z"),
      "2026-03-07"
    );
    // 2026-07-15 03:30 UTC = 2026-07-14 23:30 EDT
    assert.equal(
      formatAmericaNewYorkDateKey("2026-07-15T03:30:00.000Z"),
      "2026-07-14"
    );
    // Same instant, NY morning
    assert.equal(
      formatAmericaNewYorkDateKey("2026-07-15T14:00:00.000Z"),
      "2026-07-15"
    );
  });
});
