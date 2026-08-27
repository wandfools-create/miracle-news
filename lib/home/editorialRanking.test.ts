/**
 * Home editorial ranking — pin expiry + 7d core windows (no DB / OpenAI).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeEditorialScore,
  filterHomeCoreEligible,
  isForceTopStoryPin,
  pickDiversifiedByEditorialScore,
  sortArticlesByEditorialScore,
  TOP_STORY_FORCE_WINDOW_MS,
  TOP_STORY_HISTORICAL_POINTS,
  HOME_CORE_MAX_WINDOW_MS,
} from "./editorialRanking";
import { pickFeaturedArticle } from "./featuredSelection";
import { pickSidebarLatestArticles } from "./pickSidebarLatest";
import { prepareEditionHomeSections } from "./prepareEditionHomeSections";
import { pickTrendingIssues } from "./pickTrendingIssues";
import type { HomeArticleCard } from "./types";

const NOW = Date.parse("2026-08-27T12:00:00.000Z");

function hoursAgo(hours: number): string {
  return new Date(NOW - hours * 60 * 60 * 1000).toISOString();
}

function card(
  overrides: Partial<HomeArticleCard> & Pick<HomeArticleCard, "id">
): HomeArticleCard {
  return {
    title: overrides.title ?? `Title ${overrides.id}`,
    summary: "요약",
    slug: overrides.id,
    created_at: hoursAgo(2),
    source: "AP",
    category: "politics",
    published_at: hoursAgo(2),
    source_published_at: hoursAgo(2),
    editorial_priority: "normal",
    thumbnail_url: null,
    title_original: overrides.title ?? `Title ${overrides.id}`,
    source_country: "US",
    original_url: `https://apnews.com/${overrides.id}`,
    ...overrides,
  };
}

describe("stale top-story expiry", () => {
  it("91-day is_top_story is not featured / sidebar / KR-US", () => {
    const stale = card({
      id: "kakao-may",
      article_id: "54ca435f-100e-4393-bc44-53100738eb0a",
      title: "카카오 파업",
      source: "chosun",
      source_country: "KR",
      original_url: "https://www.chosun.com/kakao",
      is_top_story: true,
      top_story_order: 1,
      published_at: hoursAgo(91 * 24),
      source_published_at: hoursAgo(91 * 24),
      created_at: hoursAgo(91 * 24),
    });
    const fresh = card({
      id: "fresh-best",
      title: "최근 best",
      ai_recommend_grade: "best",
      ai_recommend_score: 90,
      published_at: hoursAgo(6),
    });
    const pool = [stale, fresh];

    assert.equal(isForceTopStoryPin(stale, NOW), false);
    assert.equal(computeEditorialScore(stale, NOW).topStory, 0);
    assert.equal(pickFeaturedArticle(pool, NOW)?.id, "fresh-best");
    assert.ok(!pickSidebarLatestArticles(pool, 5, NOW).some((a) => a.id === "kakao-may"));

    const sections = prepareEditionHomeSections(
      pool,
      "ko",
      { leftTitle: "KR", rightTitle: "US" },
      { nowMs: NOW }
    );
    assert.notEqual(sections.featured?.id, "kakao-may");
    assert.ok(!sections.sidebar.some((a) => a.id === "kakao-may"));
    assert.ok(!sections.topStories?.left.some((a) => a.id === "kakao-may"));
    assert.ok(!sections.topStories?.right.some((a) => a.id === "kakao-may"));
    // Category archive may still list it.
    assert.ok(
      Object.values(sections.groupedByCategory).some((list) =>
        list.some((a) => a.id === "kakao-may")
      )
    );
  });

  it("24h is_top_story still wins featured", () => {
    const pinned = card({
      id: "pin",
      is_top_story: true,
      top_story_order: 1,
      published_at: hoursAgo(12),
      ai_recommend_grade: "low",
      ai_recommend_score: 1,
    });
    const best = card({
      id: "best",
      ai_recommend_grade: "best",
      ai_recommend_score: 99,
      published_at: hoursAgo(1),
    });
    assert.equal(isForceTopStoryPin(pinned, NOW), true);
    assert.equal(pickFeaturedArticle([best, pinned], NOW)?.id, "pin");
  });

  it("72h boundary: at 71h force pin; at 73h historical only", () => {
    const inside = card({
      id: "in",
      is_top_story: true,
      published_at: hoursAgo(71),
    });
    const outside = card({
      id: "out",
      is_top_story: true,
      published_at: hoursAgo(73),
    });
    assert.equal(isForceTopStoryPin(inside, NOW), true);
    assert.ok(computeEditorialScore(inside, NOW).topStory >= 1_000_000);
    assert.equal(isForceTopStoryPin(outside, NOW), false);
    assert.equal(
      computeEditorialScore(outside, NOW).topStory,
      TOP_STORY_HISTORICAL_POINTS
    );
    assert.ok(73 * 3600_000 < HOME_CORE_MAX_WINDOW_MS);
    assert.ok(71 * 3600_000 < TOP_STORY_FORCE_WINDOW_MS);
  });

  it("7d boundary: day 6 eligible; day 8 excluded from core", () => {
    const d6 = card({ id: "d6", published_at: hoursAgo(6 * 24) });
    const d8 = card({ id: "d8", published_at: hoursAgo(8 * 24) });
    assert.deepEqual(
      filterHomeCoreEligible([d6, d8], NOW).map((a) => a.id),
      ["d6"]
    );
    assert.equal(pickFeaturedArticle([d8], NOW), null);
    assert.equal(pickSidebarLatestArticles([d8], 5, NOW).length, 0);
  });

  it("does not fill thin pools with 3-month-old archive", () => {
    const onlyOld = [
      card({
        id: "old1",
        published_at: hoursAgo(90 * 24),
        is_top_story: true,
      }),
      card({
        id: "old2",
        published_at: hoursAgo(100 * 24),
      }),
    ];
    assert.equal(pickSidebarLatestArticles(onlyOld, 5, NOW).length, 0);
    assert.equal(pickFeaturedArticle(onlyOld, NOW), null);
    const sections = prepareEditionHomeSections(
      onlyOld,
      "ko",
      { leftTitle: "KR", rightTitle: "US" },
      { nowMs: NOW }
    );
    assert.equal(sections.featured, null);
    assert.equal(sections.sidebar.length, 0);
    assert.equal(sections.topStories?.left.length, 0);
  });
});

describe("manual priority windows", () => {
  it("recent manual priority outranks AI best", () => {
    const manual = card({
      id: "manual",
      editorial_priority: "issue",
      editorial_priority_manual: true,
      published_at: hoursAgo(10),
      ai_recommend_grade: "low",
    });
    const best = card({
      id: "best",
      ai_recommend_grade: "best",
      ai_recommend_score: 99,
      published_at: hoursAgo(2),
    });
    assert.equal(
      sortArticlesByEditorialScore([best, manual], NOW)[0]?.id,
      "manual"
    );
  });

  it("old manual priority does not bypass 7d core window", () => {
    const oldManual = card({
      id: "old-manual",
      editorial_priority: "breaking",
      editorial_priority_manual: true,
      published_at: hoursAgo(30 * 24),
      source_published_at: hoursAgo(1), // must not use source-only for eligibility
    });
    const fresh = card({
      id: "fresh",
      published_at: hoursAgo(3),
      ai_recommend_grade: "priority",
      ai_recommend_score: 70,
    });
    assert.equal(computeEditorialScore(oldManual, NOW).manualPriority, 0);
    assert.equal(pickFeaturedArticle([oldManual, fresh], NOW)?.id, "fresh");
    assert.ok(
      !pickSidebarLatestArticles([oldManual, fresh], 5, NOW).some(
        (a) => a.id === "old-manual"
      )
    );
  });
});

describe("AI vs freshness", () => {
  it("recent best/priority outranks newer low", () => {
    const best = card({
      id: "best",
      ai_recommend_grade: "best",
      ai_recommend_score: 90,
      published_at: hoursAgo(8),
    });
    const low = card({
      id: "low",
      ai_recommend_grade: "low",
      ai_recommend_score: 18,
      published_at: hoursAgo(0.2),
    });
    assert.ok(
      sortArticlesByEditorialScore([low, best], NOW).findIndex(
        (a) => a.id === "best"
      ) <
        sortArticlesByEditorialScore([low, best], NOW).findIndex(
          (a) => a.id === "low"
        )
    );
  });
});

describe("trending lead updates", () => {
  it("keeps ~46h breaking issue valid", () => {
    const tornado = card({
      id: "tornado",
      title: "프랑스 토네이도",
      topic_key: "france-tornado-pomas",
      topic_label: "프랑스 토네이도",
      editorial_priority: "breaking",
      ai_recommend_grade: "priority",
      ai_recommend_score: 66,
      published_at: hoursAgo(46),
      source_published_at: hoursAgo(46),
    });
    const { us } = pickTrendingIssues([tornado], "ko", 3, NOW);
    assert.equal(us.length, 1);
    assert.equal(us[0]?.primaryArticle?.slug, "tornado");
  });

  it("prefers newer meaningful update as lead when scores are close", () => {
    const older = card({
      id: "older",
      topic_key: "lee-approval",
      topic_label: "지지율",
      ai_recommend_grade: "priority",
      ai_recommend_score: 80,
      published_at: hoursAgo(20),
    });
    const newer = card({
      id: "newer",
      topic_key: "lee-jae-myung-approval-rating",
      topic_label: "이재명 대통령 지지율",
      ai_recommend_grade: "priority",
      ai_recommend_score: 76,
      published_at: hoursAgo(2),
    });
    // Same cluster after normalize
    const { us } = pickTrendingIssues([older, newer], "en", 3, NOW);
    // Both may collapse to lee-approval — lead should prefer newer when close
    const issue = us.find((i) => i.id.includes("lee"));
    assert.ok(issue);
    assert.equal(issue?.primaryArticle?.slug, "newer");
  });
});

describe("KO/EN core policy parity", () => {
  it("applies the same 7d / pin rules on both locales", () => {
    const stale = card({
      id: "stale",
      article_id: "art-stale",
      is_top_story: true,
      published_at: hoursAgo(91 * 24),
      source: "chosun",
      source_country: "KR",
      original_url: "https://chosun.com/x",
    });
    const fresh = card({
      id: "fresh",
      article_id: "art-fresh",
      ai_recommend_grade: "best",
      ai_recommend_score: 88,
      published_at: hoursAgo(4),
    });
    const pool = [stale, fresh];
    const ko = prepareEditionHomeSections(
      pool,
      "ko",
      { leftTitle: "KR", rightTitle: "US" },
      { nowMs: NOW }
    );
    const en = prepareEditionHomeSections(
      pool,
      "en",
      { leftTitle: "US", rightTitle: "KR" },
      { nowMs: NOW }
    );
    assert.equal(ko.featured?.article_id, en.featured?.article_id);
    assert.equal(ko.featured?.id, "fresh");
    assert.ok(!ko.sidebar.some((a) => a.id === "stale"));
    assert.ok(!en.sidebar.some((a) => a.id === "stale"));
  });
});

describe("diversity still works inside window", () => {
  it("caps source at 2 inside eligible pool", () => {
    const items = [
      card({ id: "a", source: "The Korea Herald", source_country: "KR", original_url: "https://koreaherald.com/a", published_at: hoursAgo(1), ai_recommend_grade: "priority", ai_recommend_score: 80 }),
      card({ id: "b", source: "The Korea Herald", source_country: "KR", original_url: "https://koreaherald.com/b", published_at: hoursAgo(2), ai_recommend_grade: "priority", ai_recommend_score: 70 }),
      card({ id: "c", source: "The Korea Herald", source_country: "KR", original_url: "https://koreaherald.com/c", published_at: hoursAgo(3), ai_recommend_grade: "priority", ai_recommend_score: 60 }),
      card({ id: "d", source: "AP", published_at: hoursAgo(1.5), ai_recommend_grade: "best", ai_recommend_score: 90 }),
      card({ id: "e", source: "Reuters", published_at: hoursAgo(2.5), ai_recommend_grade: "priority", ai_recommend_score: 75 }),
    ];
    const picked = pickDiversifiedByEditorialScore(items, {
      limit: 4,
      nowMs: NOW,
      sourceCap: 2,
    });
    const kh = picked.filter((a) => a.source.includes("Herald")).length;
    assert.ok(kh <= 2);
  });
});
