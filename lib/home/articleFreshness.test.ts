import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareArticlesByFreshness,
  sortArticlesByFreshness,
} from "./articleFreshness";
import { pickFeaturedArticle, sortHomeArticlesForDisplay } from "./featuredSelection";
import type { HomeArticleCard } from "./types";

const NOW = Date.parse("2026-08-22T18:00:00.000Z");

function hoursAgo(hours: number): string {
  return new Date(NOW - hours * 60 * 60 * 1000).toISOString();
}

function card(
  overrides: Partial<HomeArticleCard> & Pick<HomeArticleCard, "id" | "title">
): HomeArticleCard {
  return {
    summary: null,
    slug: overrides.id,
    created_at: hoursAgo(48),
    source: "ap",
    category: "other",
    published_at: null,
    source_published_at: null,
    editorial_priority: "normal",
    thumbnail_url: null,
    title_original: overrides.title,
    ...overrides,
  };
}

describe("home freshness priority", () => {
  it("A: breaking 3h ago beats normal 30m ago", () => {
    const breaking = card({
      id: "breaking",
      title: "breaking",
      editorial_priority: "breaking",
      source_published_at: hoursAgo(3),
    });
    const normal = card({
      id: "normal",
      title: "normal",
      editorial_priority: "normal",
      source_published_at: hoursAgo(0.5),
    });
    assert.ok(compareArticlesByFreshness(breaking, normal, NOW) < 0);
    assert.equal(sortArticlesByFreshness([normal, breaking], NOW)[0]?.id, "breaking");
  });

  it("B: expired breaking 25h ago loses to normal 30m ago", () => {
    const breaking = card({
      id: "breaking-old",
      title: "breaking-old",
      editorial_priority: "breaking",
      source_published_at: hoursAgo(25),
    });
    const normal = card({
      id: "normal",
      title: "normal",
      editorial_priority: "normal",
      source_published_at: hoursAgo(0.5),
    });
    assert.ok(compareArticlesByFreshness(normal, breaking, NOW) < 0);
    assert.equal(
      sortArticlesByFreshness([breaking, normal], NOW)[0]?.id,
      "normal"
    );
  });

  it("C: newer normal beats older normal", () => {
    const recent = card({
      id: "recent",
      title: "recent",
      source_published_at: hoursAgo(10 / 60),
    });
    const older = card({
      id: "older",
      title: "older",
      source_published_at: hoursAgo(2),
    });
    assert.equal(sortArticlesByFreshness([older, recent], NOW)[0]?.id, "recent");
  });

  it("D: manual is_top_story still wins featured hero", () => {
    const manual = card({
      id: "manual",
      title: "manual top",
      is_top_story: true,
      top_story_order: 1,
      source_published_at: hoursAgo(40),
      published_at: hoursAgo(40),
    });
    const fresh = card({
      id: "fresh",
      title: "fresh normal",
      source_published_at: hoursAgo(0.1),
      published_at: hoursAgo(0.1),
    });
    const featured = pickFeaturedArticle([fresh, manual], NOW);
    assert.equal(featured?.id, "manual");
  });

  it("falls back to published_at when source_published_at is missing", () => {
    const withSource = card({
      id: "source",
      title: "source",
      source_published_at: hoursAgo(1),
      published_at: hoursAgo(10),
    });
    const siteOnly = card({
      id: "site",
      title: "site",
      source_published_at: null,
      published_at: hoursAgo(0.2),
    });
    assert.equal(
      sortHomeArticlesForDisplay([withSource, siteOnly], NOW)[0]?.id,
      "site"
    );
  });
});
