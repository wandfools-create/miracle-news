/**
 * 「지금 주목」 picker fixtures — no DB / OpenAI.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickSidebarLatestArticles } from "./pickSidebarLatest";
import type { HomeArticleCard } from "./types";

const NOW = Date.parse("2026-08-27T12:00:00.000Z");

function card(
  overrides: Partial<HomeArticleCard> & Pick<HomeArticleCard, "id">
): HomeArticleCard {
  return {
    title: "기사",
    summary: "요약",
    slug: overrides.id,
    created_at: new Date(NOW - 2 * 3600_000).toISOString(),
    source: "AP",
    category: "politics",
    published_at: new Date(NOW - 2 * 3600_000).toISOString(),
    source_published_at: new Date(NOW - 2 * 3600_000).toISOString(),
    thumbnail_url: null,
    title_original: "Article",
    source_country: "US",
    ...overrides,
  };
}

describe("pickSidebarLatestArticles", () => {
  it("returns recent articles within the surface window", () => {
    const articles = [
      card({
        id: "a1",
        published_at: new Date(NOW - 3600_000).toISOString(),
        source_published_at: new Date(NOW - 3600_000).toISOString(),
      }),
      card({
        id: "a2",
        published_at: new Date(NOW - 2 * 3600_000).toISOString(),
        source_published_at: new Date(NOW - 2 * 3600_000).toISOString(),
      }),
    ];
    const side = pickSidebarLatestArticles(articles, 5, NOW);
    assert.equal(side.length, 2);
    assert.equal(side[0]?.id, "a1");
  });

  it("falls back to newest published cards when freshness windows are empty", () => {
    const articles = [
      card({
        id: "old1",
        source_published_at: new Date(NOW - 40 * 24 * 3600_000).toISOString(),
        published_at: new Date(NOW - 40 * 24 * 3600_000).toISOString(),
        created_at: new Date(NOW - 40 * 24 * 3600_000).toISOString(),
      }),
      card({
        id: "old2",
        source_published_at: new Date(NOW - 50 * 24 * 3600_000).toISOString(),
        published_at: new Date(NOW - 50 * 24 * 3600_000).toISOString(),
        created_at: new Date(NOW - 50 * 24 * 3600_000).toISOString(),
      }),
    ];
    const side = pickSidebarLatestArticles(articles, 5, NOW);
    assert.equal(side.length, 2);
    assert.equal(side[0]?.id, "old1");
  });

  it("never returns empty when published cards exist", () => {
    const articles = [
      card({
        id: "x",
        source_published_at: null,
        published_at: null,
        created_at: new Date(NOW - 1000).toISOString(),
      }),
    ];
    const side = pickSidebarLatestArticles(articles, 5, NOW);
    assert.equal(side.length, 1);
  });
});
