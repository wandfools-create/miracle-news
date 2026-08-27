import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachServerBuiltSources,
  buildShortsSourceArticles,
} from "./buildShortsSources";
import { SHORTS_CLOSING_LINE } from "./shortsPackageTypes";

const articles = [
  {
    id: "a1",
    source: "AP",
    source_country: "US",
    title_ko: "한눈 제목",
    title_original: "Original",
    summary_ko: null,
    summary_original: null,
    body_translated: null,
    body_original: null,
    original_url: "https://publisher.example/story",
    canonical_url: "https://publisher.example/canonical",
    thumbnail_url: null,
    published_at: null,
    ko_slug: "hannoon-title-a1",
    ko_localization_title: "공개 한국어 제목",
  },
];

describe("buildShortsSources", () => {
  it("builds Hannoon URL and original URL from server article data", () => {
    const sources = buildShortsSourceArticles(articles);
    assert.equal(sources.length, 1);
    assert.equal(sources[0]?.title, "공개 한국어 제목");
    assert.equal(sources[0]?.sourceDisplayName, "AP");
    assert.equal(sources[0]?.originalUrl, "https://publisher.example/story");
    assert.ok(sources[0]?.hannoonUrl?.includes("/ko/article/hannoon-title-a1"));
  });

  it("overwrites client/AI URLs with server data", () => {
    const attached = attachServerBuiltSources(
      {
        title: "t",
        hook: "h",
        narration: `n ${SHORTS_CLOSING_LINE}`,
        scenes: [{ index: 1, subtitle: "s", visualPlan: "v" }],
        articleMediaSuggestions: [
          {
            articleId: "a1",
            title: "client title",
            url: "https://evil.example/client",
            imageSuggestion: "img",
            videoSuggestion: "vid",
          },
        ],
        sourceArticles: [
          {
            articleId: "a1",
            title: "client",
            hannoonUrl: "https://evil.example/h",
            sourceDisplayName: "client",
            originalUrl: "https://evil.example/o",
          },
        ],
        estimatedDurationSec: 75,
        closingLine: SHORTS_CLOSING_LINE,
      },
      articles
    );

    assert.equal(attached.sourceArticles[0]?.originalUrl, "https://publisher.example/story");
    assert.notEqual(attached.sourceArticles[0]?.hannoonUrl, "https://evil.example/h");
    assert.notEqual(attached.articleMediaSuggestions[0]?.url, "https://evil.example/client");
  });
});
