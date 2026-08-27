/**
 * Home editorial ranking Phase 1 — before/after fixtures (no DB / OpenAI).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sortArticlesByFreshness } from "./articleFreshness";
import {
  computeEditorialScore,
  pickDiversifiedByEditorialScore,
  sortArticlesByEditorialScore,
} from "./editorialRanking";
import { pickFeaturedArticle } from "./featuredSelection";
import { prepareEditionHomeSections } from "./prepareEditionHomeSections";
import { normalizeTopicClusterKey } from "./topicClusterKey";
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

/** Recent published pool resembling Production mix (importance mostly missing). */
function recentPublishedFixture(): HomeArticleCard[] {
  return [
    card({
      id: "fresh-normal-40",
      title: "방금 올라온 일반 기사",
      source: "AP",
      published_at: hoursAgo(0.4),
      source_published_at: hoursAgo(0.4),
      editorial_priority: "normal",
      ai_recommend_grade: null,
      ai_recommend_score: null,
    }),
    card({
      id: "best-90",
      title: "후보 best 90 국제 속보",
      source: "Reuters",
      published_at: hoursAgo(6),
      source_published_at: hoursAgo(8),
      editorial_priority: "normal",
      ai_recommend_grade: "best",
      ai_recommend_score: 90,
    }),
    card({
      id: "priority-72",
      title: "후보 priority 72",
      source: "조선일보",
      source_country: "KR",
      original_url: "https://www.chosun.com/p72",
      published_at: hoursAgo(5),
      source_published_at: hoursAgo(5),
      editorial_priority: "normal",
      ai_recommend_grade: "priority",
      ai_recommend_score: 72,
    }),
    card({
      id: "low-18",
      title: "후보 low 18 최신",
      source: "AP",
      published_at: hoursAgo(0.2),
      source_published_at: hoursAgo(0.2),
      editorial_priority: "normal",
      ai_recommend_grade: "low",
      ai_recommend_score: 18,
    }),
    card({
      id: "old-breaking",
      title: "3일 전 breaking",
      source: "CNN",
      published_at: hoursAgo(72),
      source_published_at: hoursAgo(72),
      editorial_priority: "breaking",
      editorial_priority_manual: false,
    }),
    card({
      id: "manual-issue",
      title: "수동 issue",
      source: "NYT",
      published_at: hoursAgo(10),
      source_published_at: hoursAgo(10),
      editorial_priority: "issue",
      editorial_priority_manual: true,
      ai_recommend_grade: "low",
      ai_recommend_score: 10,
    }),
    card({
      id: "top-story",
      title: "수동 top story",
      source: "WP",
      is_top_story: true,
      top_story_order: 1,
      published_at: hoursAgo(30),
      source_published_at: hoursAgo(30),
      editorial_priority: "normal",
      ai_recommend_grade: "normal",
      ai_recommend_score: 40,
    }),
    card({
      id: "kh-1",
      title: "Herald A",
      source: "The Korea Herald",
      source_country: "KR",
      original_url: "https://www.koreaherald.com/a",
      published_at: hoursAgo(1),
      source_published_at: hoursAgo(1),
      category: "world",
    }),
    card({
      id: "kh-2",
      title: "Herald B",
      source: "The Korea Herald",
      source_country: "KR",
      original_url: "https://www.koreaherald.com/b",
      published_at: hoursAgo(1.5),
      source_published_at: hoursAgo(1.5),
      category: "world",
    }),
    card({
      id: "kh-3",
      title: "Herald C",
      source: "The Korea Herald",
      source_country: "KR",
      original_url: "https://www.koreaherald.com/c",
      published_at: hoursAgo(2),
      source_published_at: hoursAgo(2),
      category: "world",
    }),
    card({
      id: "nepal-a",
      title: "네팔 홍수 피해",
      topic_key: "nepal-china-flood",
      topic_label: "네팔 홍수",
      source: "Reuters",
      published_at: hoursAgo(3),
      source_published_at: hoursAgo(3),
      category: "world",
      ai_recommend_grade: "priority",
      ai_recommend_score: 65,
    }),
    card({
      id: "nepal-b",
      title: "네팔 빙하 홍수",
      topic_key: "nepal-glacier-floods",
      topic_label: "네팔 빙하 홍수",
      source: "AP",
      published_at: hoursAgo(3.5),
      source_published_at: hoursAgo(3.5),
      category: "world",
      ai_recommend_grade: "priority",
      ai_recommend_score: 60,
    }),
    card({
      id: "legacy-no-ai",
      title: "기존 기사 AI 없음",
      source: "연합뉴스",
      source_country: "KR",
      original_url: "https://www.yna.co.kr/legacy",
      published_at: hoursAgo(4),
      source_published_at: hoursAgo(4),
      editorial_priority: "special",
      category: "politics",
    }),
  ];
}

describe("editorial ranking Phase 1", () => {
  it("best 90 outranks newer normal without AI grade", () => {
    const pool = recentPublishedFixture();
    const sorted = sortArticlesByEditorialScore(pool, NOW);
    const bestIdx = sorted.findIndex((a) => a.id === "best-90");
    const freshIdx = sorted.findIndex((a) => a.id === "fresh-normal-40");
    assert.ok(bestIdx < freshIdx);

    const legacy = sortArticlesByFreshness(pool, NOW);
    // Pre-Phase-1 freshness: newer low/normal rise above older best.
    assert.ok(
      legacy.findIndex((a) => a.id === "low-18") <
        legacy.findIndex((a) => a.id === "best-90")
    );
  });

  it("priority 70+ outranks low 18 even when low is newer", () => {
    const sorted = sortArticlesByEditorialScore(recentPublishedFixture(), NOW);
    const pIdx = sorted.findIndex((a) => a.id === "priority-72");
    const lIdx = sorted.findIndex((a) => a.id === "low-18");
    assert.ok(pIdx < lIdx);
  });

  it("old breaking does not stay permanently pinned", () => {
    const sorted = sortArticlesByEditorialScore(recentPublishedFixture(), NOW);
    assert.notEqual(sorted[0]?.id, "old-breaking");
    const score = computeEditorialScore(
      recentPublishedFixture().find((a) => a.id === "old-breaking")!,
      NOW
    );
    assert.equal(score.editorialPriority, 0);
  });

  it("is_top_story always wins featured and ranking", () => {
    const pool = recentPublishedFixture();
    assert.equal(pickFeaturedArticle(pool, NOW)?.id, "top-story");
    assert.equal(sortArticlesByEditorialScore(pool, NOW)[0]?.id, "top-story");
  });

  it("manual editorial priority outranks AI grade", () => {
    const sorted = sortArticlesByEditorialScore(
      recentPublishedFixture().filter((a) => a.id !== "top-story"),
      NOW
    );
    assert.equal(sorted[0]?.id, "manual-issue");
    assert.ok(
      computeEditorialScore(
        recentPublishedFixture().find((a) => a.id === "manual-issue")!,
        NOW
      ).manualPriority >
        computeEditorialScore(
          recentPublishedFixture().find((a) => a.id === "best-90")!,
          NOW
        ).aiGrade
    );
  });

  it("caps same source at 2 then relaxes when pool is thin", () => {
    const mixed = [
      ...recentPublishedFixture().filter((a) =>
        ["kh-1", "kh-2", "kh-3", "best-90", "priority-72", "fresh-normal-40", "low-18"].includes(
          a.id
        )
      ),
      card({
        id: "extra-reuters",
        source: "Reuters",
        published_at: hoursAgo(4),
        ai_recommend_grade: "normal",
        ai_recommend_score: 50,
      }),
    ];
    const capped = pickDiversifiedByEditorialScore(mixed, {
      limit: 5,
      nowMs: NOW,
      sourceCap: 2,
      balanceRegions: false,
    });
    const khCount = capped.filter((a) =>
      a.source.toLowerCase().includes("herald")
    ).length;
    assert.ok(khCount <= 2);

    const onlyHerald = [
      card({
        id: "h1",
        source: "The Korea Herald",
        source_country: "KR",
        original_url: "https://www.koreaherald.com/1",
        published_at: hoursAgo(1),
      }),
      card({
        id: "h2",
        source: "The Korea Herald",
        source_country: "KR",
        original_url: "https://www.koreaherald.com/2",
        published_at: hoursAgo(2),
      }),
      card({
        id: "h3",
        source: "The Korea Herald",
        source_country: "KR",
        original_url: "https://www.koreaherald.com/3",
        published_at: hoursAgo(3),
      }),
    ];
    const relaxed = pickDiversifiedByEditorialScore(onlyHerald, {
      limit: 3,
      nowMs: NOW,
      sourceCap: 2,
    });
    assert.equal(relaxed.length, 3);
  });

  it("suppresses near-duplicate Nepal flood topic clusters", () => {
    const a = normalizeTopicClusterKey({
      topic_key: "nepal-china-flood",
      topic_label: "네팔 홍수",
    });
    const b = normalizeTopicClusterKey({
      topic_key: "nepal-glacier-floods",
      topic_label: "네팔 빙하 홍수",
    });
    assert.equal(a, b);

    const picked = pickDiversifiedByEditorialScore(
      recentPublishedFixture().filter((x) =>
        ["nepal-a", "nepal-b", "best-90"].includes(x.id)
      ),
      { limit: 3, nowMs: NOW, suppressTopicClusters: true }
    );
    const nepalIds = picked.filter((x) => x.id.startsWith("nepal"));
    assert.equal(nepalIds.length, 1);
  });

  it("KO/EN prepareEditionHomeSections stay consistent on shared article_ids", () => {
    const pool = recentPublishedFixture().map((a) => ({
      ...a,
      article_id: `art-${a.id}`,
    }));
    const ko = prepareEditionHomeSections(pool, "ko", {
      leftTitle: "KR",
      rightTitle: "US",
    }, { nowMs: NOW });
    const en = prepareEditionHomeSections(pool, "en", {
      leftTitle: "US",
      rightTitle: "KR",
    }, { nowMs: NOW });

    assert.equal(ko.featured?.article_id, en.featured?.article_id);
    assert.equal(ko.featured?.id, "top-story");
    assert.ok(ko.sidebar.length > 0);
    assert.ok(en.sidebar.length > 0);
    assert.ok(ko.visibleCategories.includes("politics"));
    assert.ok(ko.groupedByCategory.politics?.length);
    assert.ok(en.groupedByCategory.politics?.length);
  });

  it("legacy articles without AI grade still sort by priority + published_at", () => {
    const sorted = sortArticlesByEditorialScore(
      [
        card({
          id: "n",
          published_at: hoursAgo(1),
          editorial_priority: "normal",
        }),
        card({
          id: "s",
          published_at: hoursAgo(3),
          editorial_priority: "special",
        }),
      ],
      NOW
    );
    assert.equal(sorted[0]?.id, "s");
  });

  it("before/after home top: importance rises vs pure freshness", () => {
    const pool = recentPublishedFixture().filter((a) => a.id !== "top-story");
    const before = sortArticlesByFreshness(pool, NOW).slice(0, 5).map((a) => a.id);
    const after = sortArticlesByEditorialScore(pool, NOW)
      .slice(0, 5)
      .map((a) => a.id);

    assert.ok(before.includes("low-18") || before.includes("fresh-normal-40"));
    assert.ok(after.includes("manual-issue"));
    assert.ok(after.includes("best-90"));
    assert.ok(!after.slice(0, 3).includes("low-18"));
  });

  it("priority ladder: top_story > manual > AI best > auto priority > freshness > low/normal", () => {
    const ladder = [
      card({
        id: "fresh-low",
        published_at: hoursAgo(0.1),
        ai_recommend_grade: "low",
        ai_recommend_score: 5,
      }),
      card({
        id: "fresh-normal",
        published_at: hoursAgo(0.2),
        editorial_priority: "normal",
      }),
      card({
        id: "auto-special",
        published_at: hoursAgo(2),
        editorial_priority: "special",
        editorial_priority_manual: false,
      }),
      card({
        id: "ai-best",
        published_at: hoursAgo(8),
        ai_recommend_grade: "best",
        ai_recommend_score: 95,
      }),
      card({
        id: "manual",
        published_at: hoursAgo(20),
        editorial_priority: "issue",
        editorial_priority_manual: true,
        ai_recommend_grade: "best",
        ai_recommend_score: 99,
      }),
      card({
        id: "pinned",
        is_top_story: true,
        top_story_order: 1,
        published_at: hoursAgo(40),
        ai_recommend_grade: "low",
        ai_recommend_score: 1,
      }),
    ];
    assert.deepEqual(
      sortArticlesByEditorialScore(ladder, NOW).map((a) => a.id),
      ["pinned", "manual", "ai-best", "auto-special", "fresh-normal", "fresh-low"]
    );
  });

  it("AI low does not weaken human manual priority score", () => {
    const manualLowAi = card({
      id: "m",
      editorial_priority: "issue",
      editorial_priority_manual: true,
      ai_recommend_grade: "low",
      ai_recommend_score: 1,
      published_at: hoursAgo(5),
    });
    const score = computeEditorialScore(manualLowAi, NOW);
    assert.equal(score.aiGrade, 0);
    assert.equal(score.aiScore, 0);
    assert.ok(score.manualPriority > 0);
  });

  it("AI score only fine-tunes within the same grade", () => {
    const bestLow = card({
      id: "b1",
      ai_recommend_grade: "best",
      ai_recommend_score: 1,
      published_at: hoursAgo(5),
    });
    const bestHigh = card({
      id: "b2",
      ai_recommend_grade: "best",
      ai_recommend_score: 99,
      published_at: hoursAgo(5),
    });
    const priorityHigh = card({
      id: "p",
      ai_recommend_grade: "priority",
      ai_recommend_score: 100,
      published_at: hoursAgo(1),
    });
    assert.ok(
      computeEditorialScore(bestHigh, NOW).total >
        computeEditorialScore(bestLow, NOW).total
    );
    assert.ok(
      computeEditorialScore(bestLow, NOW).total >
        computeEditorialScore(priorityHigh, NOW).total
    );
  });

  it("very old best loses AI band and does not permanently pin", () => {
    const ancientBest = card({
      id: "ancient-best",
      ai_recommend_grade: "best",
      ai_recommend_score: 99,
      published_at: hoursAgo(10 * 24),
      source_published_at: hoursAgo(10 * 24),
      created_at: hoursAgo(10 * 24),
    });
    const freshNormal = card({
      id: "fresh",
      published_at: hoursAgo(1),
      editorial_priority: "normal",
    });
    const ancientScore = computeEditorialScore(ancientBest, NOW);
    assert.equal(ancientScore.aiGrade, 0);
    assert.equal(ancientScore.aiScore, 0);
    assert.equal(
      sortArticlesByEditorialScore([ancientBest, freshNormal], NOW)[0]?.id,
      "fresh"
    );
  });
});

describe("topic cluster safety", () => {
  it("keeps UPDATE / DIFFERENT ANGLE distinct from base SAME EVENT", () => {
    const base = normalizeTopicClusterKey({
      topic_key: "nepal-china-flood",
      topic_label: "네팔 홍수",
    });
    const deathTollUpdate = normalizeTopicClusterKey({
      topic_key: "nepal-flood-death-toll-update",
      topic_label: "네팔 홍수 사망자 갱신",
    });
    const govResponse = normalizeTopicClusterKey({
      topic_key: "nepal-flood-government-response",
      topic_label: "네팔 홍수 정부 대응",
    });
    assert.equal(base, "nepal-flood");
    assert.notEqual(deathTollUpdate, base);
    assert.notEqual(govResponse, base);
    assert.ok(deathTollUpdate?.startsWith("nepal-flood-"));
    assert.ok(govResponse?.startsWith("nepal-flood-"));

    const picked = pickDiversifiedByEditorialScore(
      [
        card({
          id: "n1",
          topic_key: "nepal-china-flood",
          topic_label: "네팔 홍수",
          published_at: hoursAgo(2),
          ai_recommend_grade: "priority",
          ai_recommend_score: 70,
        }),
        card({
          id: "n2",
          topic_key: "nepal-flood-death-toll-update",
          topic_label: "네팔 홍수 사망자 갱신",
          published_at: hoursAgo(1),
          ai_recommend_grade: "priority",
          ai_recommend_score: 68,
        }),
        card({
          id: "n3",
          topic_key: "nepal-glacier-floods",
          topic_label: "네팔 빙하 홍수",
          published_at: hoursAgo(3),
          ai_recommend_grade: "priority",
          ai_recommend_score: 66,
        }),
      ],
      { limit: 3, nowMs: NOW, suppressTopicClusters: true }
    );
    // SAME EVENT duplicates collapse; UPDATE angle can still appear.
    assert.equal(picked.filter((a) => a.id === "n1" || a.id === "n3").length, 1);
    assert.ok(picked.some((a) => a.id === "n2"));
  });

  it("does not merge different countries that only share flood", () => {
    const nepal = normalizeTopicClusterKey({
      topic_key: "nepal-flood",
      topic_label: "네팔 홍수",
    });
    const pakistan = normalizeTopicClusterKey({
      topic_key: "pakistan-flood",
      topic_label: "Pakistan flood",
    });
    assert.notEqual(nepal, pakistan);
  });
});

describe("duplicate candidate grade selection", () => {
  it("picks highest grade then score deterministically", async () => {
    const { pickBestCandidateGradeRow } = await import("./aiRecommendSnapshot");
    const best = pickBestCandidateGradeRow([
      {
        article_id: "a1",
        ai_recommend_grade: "normal",
        ai_recommend_score: 90,
      },
      {
        article_id: "a1",
        ai_recommend_grade: "priority",
        ai_recommend_score: 40,
      },
      {
        article_id: "a1",
        ai_recommend_grade: "priority",
        ai_recommend_score: 80,
      },
      {
        article_id: "a1",
        ai_recommend_grade: "best",
        ai_recommend_score: 10,
      },
    ]);
    assert.equal(best?.ai_recommend_grade, "best");
    assert.equal(best?.ai_recommend_score, 10);
  });
});

describe("articles AI recommend snapshot capability", () => {
  it("skips writes when env capability is off (no schema probe)", async () => {
    const {
      maybeWriteArticleAiRecommendSnapshot,
      resetArticlesAiRecommendSnapshotCapabilityForTests,
      isArticlesAiRecommendSnapshotEnabled,
    } = await import("./articlesAiRecommendCapability");
    resetArticlesAiRecommendSnapshotCapabilityForTests();
    const prev = process.env.ARTICLES_AI_RECOMMEND_SNAPSHOT;
    delete process.env.ARTICLES_AI_RECOMMEND_SNAPSHOT;
    assert.equal(isArticlesAiRecommendSnapshotEnabled(), false);

    let updates = 0;
    const result = await maybeWriteArticleAiRecommendSnapshot({
      client: {
        from: () => ({
          update: () => {
            updates += 1;
            return {
              eq: async () => ({ error: null }),
            };
          },
        }),
      },
      articleId: "art-1",
      grade: "best",
      score: 90,
    });
    assert.equal(result, "skipped");
    assert.equal(updates, 0);
    if (prev === undefined) delete process.env.ARTICLES_AI_RECOMMEND_SNAPSHOT;
    else process.env.ARTICLES_AI_RECOMMEND_SNAPSHOT = prev;
  });
});
