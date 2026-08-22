import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickTrendingIssues } from "./pickTrendingIssues";
import type { HomeArticleCard } from "./types";

const NOW = Date.parse("2026-08-22T18:00:00.000Z");

function hoursAgo(hours: number): string {
  return new Date(NOW - hours * 60 * 60 * 1000).toISOString();
}

function card(
  overrides: Partial<HomeArticleCard> & Pick<HomeArticleCard, "id">
): HomeArticleCard {
  return {
    title: "기사 제목",
    summary: "요약",
    slug: overrides.id,
    created_at: hoursAgo(48),
    source: "AP",
    category: "other",
    published_at: hoursAgo(48),
    source_published_at: hoursAgo(48),
    thumbnail_url: null,
    title_original: "Article title",
    source_country: "US",
    ...overrides,
  };
}

describe("pickTrendingIssues", () => {
  it("prefers topic buckets over category fallback", () => {
    const articles = [
      card({
        id: "a1",
        source_country: "US",
        category: "politics",
        topic_key: "us-election",
        topic_label: "미국 대선",
        source_published_at: hoursAgo(40),
      }),
      card({
        id: "a2",
        source_country: "US",
        category: "politics",
        topic_key: "us-election",
        topic_label: "미국 대선",
        source_published_at: hoursAgo(20),
      }),
      card({
        id: "a3",
        source_country: "US",
        category: "economy",
        title: "최신 경제 기사",
        source_published_at: hoursAgo(2),
      }),
    ];

    const { us } = pickTrendingIssues(articles, "ko", 3, NOW);
    assert.equal(us[0]?.title, "미국 대선");
    assert.equal(us[0]?.id, "topic:us-election");
    assert.ok(us.some((issue) => issue.id.startsWith("cat:economy:")));
  });

  it("falls back to latest articles across all categories including other", () => {
    const articles = [
      card({
        id: "old",
        source: "연합뉴스",
        source_country: "KR",
        original_url: "https://www.yna.co.kr/old",
        category: "other",
        title: "오래된 기사",
        source_published_at: hoursAgo(20 * 24),
      }),
      card({
        id: "new",
        source: "연합뉴스",
        source_country: "KR",
        original_url: "https://www.yna.co.kr/new",
        category: "other",
        title: "최신 기사",
        source_published_at: hoursAgo(3),
      }),
    ];

    const { kr } = pickTrendingIssues(articles, "ko", 3, NOW);
    assert.equal(kr.length, 1);
    assert.match(kr[0]?.title ?? "", /최신 기사/);
    assert.equal(kr[0]?.id, "cat:other:kr");
  });

  it("excludes articles older than 7 days from trending", () => {
    const articles = [
      card({
        id: "ancient",
        source: "연합뉴스",
        source_country: "KR",
        original_url: "https://www.yna.co.kr/ancient",
        category: "politics",
        title: "5월 기사",
        source_published_at: hoursAgo(30 * 24),
      }),
    ];
    const { kr } = pickTrendingIssues(articles, "ko", 3, NOW);
    assert.equal(kr.length, 0);
  });

  it("caps at three issues per region across categories", () => {
    const categories = ["politics", "economy", "society", "world", "religion"] as const;
    const articles = categories.map((category, index) =>
      card({
        id: `c${index}`,
        source_country: "US",
        original_url: `https://apnews.com/article/${index}`,
        category,
        title: `${category} ${index}`,
        source_published_at: hoursAgo(index + 1),
      })
    );

    const { us } = pickTrendingIssues(articles, "ko", 3, NOW);
    assert.equal(us.length, 3);
  });
});
