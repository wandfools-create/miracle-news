/**
 * Home layout policy fixtures — no DB / OpenAI.
 * Documents newspaper 3-col rails, editorial hierarchy, category panel URL.
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

  it("HomeNewsView uses 3-col rails without sticky or card-shadow chrome", () => {
    const view = readFileSync(
      join(process.cwd(), "components/home/HomeNewsView.tsx"),
      "utf8"
    );
    assert.match(view, /SpotlightRail/);
    assert.match(view, /newsHomeThreeColGrid/);
    assert.match(view, /showLeftRailContent/);
    assert.match(view, /shouldUseNewspaperThreeColGrid/);
    assert.match(view, /showRightRail/);
    assert.doesNotMatch(view, /newsHomeRightOnlyGrid/);
    assert.doesNotMatch(view, /newsHomeLeftOnlyGrid/);
    assert.match(view, /xl:col-span-full/);
    assert.match(view, /xl:row-span-2/);
    assert.doesNotMatch(view, /lg:sticky|sticky |fixed |position:\s*sticky/);
    assert.doesNotMatch(view, /SpotlightSection/);
    assert.doesNotMatch(view, /shadow-sm|shadow-md|rounded-xl/);
    assert.match(view, /role="tablist"/);
    assert.match(view, /aria-selected/);
    assert.match(view, /searchParams\.get\("category"\)/);
    assert.match(view, /FeaturedSecondary/);
    assert.match(view, /StoryListRow/);
  });

  it("TrendingIssuesPanel keeps full descriptions and article links without internal scroll", () => {
    const panel = readFileSync(
      join(process.cwd(), "components/home/TrendingIssuesPanel.tsx"),
      "utf8"
    );
    assert.match(panel, /articleHrefPrefix/);
    assert.match(panel, /primaryArticle/);
    assert.match(panel, /relatedArticles/);
    assert.match(panel, /issue\.description/);
    assert.doesNotMatch(panel, /max-h-\[|overflow-y-auto|shadow-sm|rounded-lg/);
    assert.doesNotMatch(panel, /maxPerRegion/);
    assert.doesNotMatch(panel, /similarity|fuzzy|matchTitle/i);
  });

  it("documents mobile order featured → trending → spotlight → sources → categories", () => {
    const view = readFileSync(
      join(process.cwd(), "components/home/HomeNewsView.tsx"),
      "utf8"
    );
    assert.match(view, /TodayEditionHeader/);
    assert.match(view, /PreviousHighlightsSection/);
    assert.match(view, /id="featured"[\s\S]*order-1/);
    assert.match(view, /order-2 min-w-0 xl:order-none/);
    assert.match(view, /order-3 min-w-0 xl:order-none xl:row-start-2/);
    assert.match(view, /order-5 min-w-0 scroll-mt-6/);
    assert.match(view, /order-6 min-w-0 scroll-mt-6/);
    assert.match(view, /topStoriesHasLeft && topStoriesHasRight/);
  });
});
