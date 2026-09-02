import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pickHomeSourceLeadMap,
  sortHomeCategoryArticlesForDisplay,
} from "./homeArchiveDisplay";
import type { HomeArticleCard } from "./types";

const NOW = Date.parse("2026-09-02T16:00:00.000Z");

function card(
  overrides: Partial<HomeArticleCard> & Pick<HomeArticleCard, "id">
): HomeArticleCard {
  return {
    title: "t",
    summary: "s",
    slug: overrides.id,
    created_at: overrides.published_at ?? "2026-08-31T12:00:00.000Z",
    source: "ap",
    category: "politics",
    published_at: "2026-08-31T12:00:00.000Z",
    source_published_at: "2026-08-30T12:00:00.000Z",
    thumbnail_url: null,
    title_original: "t",
    source_country: "US",
    ...overrides,
  };
}

describe("homeArchiveDisplay", () => {
  it("orders category rows by newer site publish day before editorial score", () => {
    const ranked = sortHomeCategoryArticlesForDisplay(
      [
        card({
          id: "old",
          published_at: "2026-08-30T01:00:00.000Z",
          ai_recommend_grade: "best",
          is_top_story: true,
        }),
        card({
          id: "new",
          published_at: "2026-09-01T01:11:00.000Z",
          ai_recommend_grade: "normal",
        }),
      ],
      "politics",
      NOW
    );
    assert.equal(ranked[0]?.id, "new");
  });

  it("picks the newest published article as each source lead", () => {
    const map = pickHomeSourceLeadMap(
      [
        card({
          id: "bbc-old",
          source: "bbc",
          published_at: "2026-08-31T12:00:00.000Z",
          ai_recommend_grade: "best",
        }),
        card({
          id: "bbc-new",
          source: "bbc",
          published_at: "2026-09-01T04:20:00.000Z",
          ai_recommend_grade: "normal",
        }),
      ],
      NOW
    );
    assert.equal(map.bbc?.id, "bbc-new");
  });
});
