/**
 * Home layout policy fixtures — no DB / OpenAI.
 * Documents sidebar→main spotlight move, trending rail, category panel URL.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  pickTrendingIssues,
  toTrendingRelatedArticle,
} from "./pickTrendingIssues";
import type { HomeArticleCard } from "./types";

const NOW = Date.parse("2026-08-22T18:00:00.000Z");

function card(
  overrides: Partial<HomeArticleCard> & Pick<HomeArticleCard, "id">
): HomeArticleCard {
  return {
    title: "기사 제목",
    summary: "요약",
    slug: overrides.id,
    created_at: new Date(NOW - 2 * 3600_000).toISOString(),
    source: "AP",
    category: "politics",
    published_at: new Date(NOW - 2 * 3600_000).toISOString(),
    source_published_at: new Date(NOW - 2 * 3600_000).toISOString(),
    thumbnail_url: null,
    title_original: "Article title",
    source_country: "US",
    ...overrides,
  };
}

describe("home sidebar layout and category nav (fixture)", () => {
  it("wires related article slugs for locale paths without inventing URLs", () => {
    const related = toTrendingRelatedArticle(
      card({ id: "pub1", slug: "my-story-pub1", title: "공개 기사" })
    );
    assert.equal(related?.slug, "my-story-pub1");
    assert.equal(toTrendingRelatedArticle(card({ id: "x", slug: "  " })), null);

    const { us } = pickTrendingIssues(
      [
        card({
          id: "a1",
          slug: "lead-a1",
          topic_key: "t1",
          topic_label: "이슈",
          source_published_at: new Date(NOW - 3600_000).toISOString(),
        }),
        card({
          id: "a2",
          slug: "related-a2",
          topic_key: "t1",
          topic_label: "이슈",
          source_published_at: new Date(NOW - 7200_000).toISOString(),
        }),
      ],
      "ko",
      3,
      NOW
    );
    assert.ok(us[0]?.primaryArticle?.slug);
    assert.ok(
      us[0]?.relatedArticles.every((a) => a.slug && !a.slug.includes("undefined"))
    );
  });

  it("HomeNewsView keeps trending in right rail and spotlight in main", () => {
    const view = readFileSync(
      join(process.cwd(), "components/home/HomeNewsView.tsx"),
      "utf8"
    );
    assert.match(view, /SpotlightSection/);
    assert.match(view, /showAside = showTrending/);
    assert.match(view, /lg:hidden/);
    assert.match(view, /hidden[\s\S]*lg:block/);
    assert.match(view, /role="tablist"/);
    assert.match(view, /aria-selected/);
    assert.match(view, /searchParams\.get\("category"\)/);
    assert.doesNotMatch(
      view.slice(view.indexOf("{showAside ?"), view.length),
      /sidebarTitle/
    );
  });

  it("TrendingIssuesPanel links with articleHrefPrefix locale paths", () => {
    const panel = readFileSync(
      join(process.cwd(), "components/home/TrendingIssuesPanel.tsx"),
      "utf8"
    );
    assert.match(panel, /articleHrefPrefix/);
    assert.match(panel, /primaryArticle/);
    assert.match(panel, /relatedArticles/);
    assert.doesNotMatch(panel, /similarity|fuzzy|matchTitle/i);
  });

  it("documents mobile order: top stories then trending then spotlight", () => {
    const view = readFileSync(
      join(process.cwd(), "components/home/HomeNewsView.tsx"),
      "utf8"
    );
    const trendingMobile = view.indexOf("{trendingPanel ? (");
    const spotlight = view.indexOf("<SpotlightSection");
    const categories = view.indexOf('id="categories"');
    assert.ok(trendingMobile > 0 && spotlight > trendingMobile);
    assert.ok(categories > spotlight);
  });
});
