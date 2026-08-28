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
import { normalizeTopicClusterKey, normalizeEventFamilyKey } from "./topicClusterKey";
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
    assert.equal(sections.topStories, null);
    assert.equal(sections.todayEdition?.status, "preparing");
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

  it("relaxes source cap when the eligible pool is thin", () => {
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
});

describe("phase-1 ranking coverage restored", () => {
  it("best 90 outranks newer normal without AI grade", () => {
    const best = card({
      id: "best-90",
      ai_recommend_grade: "best",
      ai_recommend_score: 90,
      published_at: hoursAgo(6),
    });
    const freshNormal = card({
      id: "fresh-normal",
      published_at: hoursAgo(0.4),
    });
    const sorted = sortArticlesByEditorialScore([freshNormal, best], NOW);
    assert.equal(sorted[0]?.id, "best-90");
  });

  it("priority 70+ outranks low 18 even when low is newer", () => {
    const priority = card({
      id: "priority-72",
      ai_recommend_grade: "priority",
      ai_recommend_score: 72,
      published_at: hoursAgo(5),
    });
    const low = card({
      id: "low-18",
      ai_recommend_grade: "low",
      ai_recommend_score: 18,
      published_at: hoursAgo(0.2),
    });
    assert.ok(
      sortArticlesByEditorialScore([low, priority], NOW).findIndex(
        (a) => a.id === "priority-72"
      ) <
        sortArticlesByEditorialScore([low, priority], NOW).findIndex(
          (a) => a.id === "low-18"
        )
    );
  });

  it("old breaking does not stay permanently pinned", () => {
    const oldBreaking = card({
      id: "old-breaking",
      editorial_priority: "breaking",
      editorial_priority_manual: false,
      published_at: hoursAgo(72),
    });
    const fresh = card({
      id: "fresh",
      published_at: hoursAgo(1),
    });
    const score = computeEditorialScore(oldBreaking, NOW);
    assert.equal(score.editorialPriority, 0);
    assert.notEqual(
      sortArticlesByEditorialScore([oldBreaking, fresh], NOW)[0]?.id,
      "old-breaking"
    );
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

  it("priority ladder inside 7d: pin > manual > AI best > auto > freshness > low", () => {
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

  it("shares nepal-flood event family while preserving glacier cause as angle", () => {
    const aFamily = normalizeEventFamilyKey({
      topic_key: "nepal-china-flood",
      topic_label: "네팔 홍수",
    });
    const bFamily = normalizeEventFamilyKey({
      topic_key: "nepal-glacier-floods",
      topic_label: "네팔 빙하 홍수",
    });
    assert.equal(aFamily, "nepal-flood");
    assert.equal(bFamily, "nepal-flood");

    const aCluster = normalizeTopicClusterKey({
      topic_key: "nepal-china-flood",
      topic_label: "네팔 홍수",
    });
    const bCluster = normalizeTopicClusterKey({
      topic_key: "nepal-glacier-floods",
      topic_label: "네팔 빙하 홍수",
    });
    assert.equal(aCluster, "nepal-flood");
    assert.notEqual(bCluster, aCluster);

    const picked = pickDiversifiedByEditorialScore(
      [
        card({
          id: "nepal-a",
          topic_key: "nepal-china-flood",
          topic_label: "네팔 홍수",
          published_at: hoursAgo(3),
          ai_recommend_grade: "priority",
          ai_recommend_score: 65,
        }),
        card({
          id: "nepal-b",
          topic_key: "nepal-glacier-floods",
          topic_label: "네팔 빙하 홍수",
          published_at: hoursAgo(3.5),
          ai_recommend_grade: "priority",
          ai_recommend_score: 60,
        }),
        card({
          id: "best-90",
          ai_recommend_grade: "best",
          ai_recommend_score: 90,
          published_at: hoursAgo(4),
        }),
      ],
      {
        limit: 3,
        nowMs: NOW,
        suppressTopicClusters: true,
        maxPerEventFamily: 1,
        requireDistinctAngleForSecond: true,
      }
    );
    assert.equal(picked.filter((x) => x.id.startsWith("nepal")).length, 1);
    assert.ok(picked.some((x) => x.id === "best-90"));
  });

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
    assert.equal(
      normalizeEventFamilyKey({ topic_key: "nepal-flood-death-toll-update" }),
      "nepal-flood"
    );
  });

  it("does not merge different countries that only share flood", () => {
    const nepal = normalizeEventFamilyKey({
      topic_key: "nepal-flood",
      topic_label: "네팔 홍수",
    });
    const pakistan = normalizeEventFamilyKey({
      topic_key: "pakistan-flood",
      topic_label: "Pakistan flood",
    });
    assert.equal(nepal, "nepal-flood");
    assert.equal(pakistan, null);
    assert.notEqual(
      normalizeTopicClusterKey({ topic_key: "nepal-flood" }),
      normalizeTopicClusterKey({ topic_key: "pakistan-flood" })
    );
  });

  it("maps Korean Nepal evacuation titles to nepal-flood family", () => {
    assert.equal(
      normalizeEventFamilyKey({
        title: "네팔 홍수로 한국인 8명 실종, 10명 고립",
        topic_key: null,
      }),
      "nepal-flood"
    );
    assert.equal(
      normalizeEventFamilyKey({
        title: "네팔 홍수에 11명 규모 신속대응팀 구성…오늘 오후 출발",
        topic_key: null,
      }),
      "nepal-flood"
    );
  });

  it("caps featured Nepal family to +1 UPDATE in 지금 주목 and blocks a third", () => {
    const featured = card({
      id: "feat-nepal",
      title: "네팔 홍수 사망자 늘어",
      topic_key: "nepal-china-flood",
      topic_label: "네팔 홍수",
      ai_recommend_grade: "best",
      ai_recommend_score: 95,
      published_at: hoursAgo(2),
      source: "The Korea Herald",
      source_country: "KR",
      original_url: "https://koreaherald.com/feat",
    });
    const update = card({
      id: "nepal-update",
      title: "네팔 홍수 사망 toll 갱신",
      topic_key: "nepal-flood-death-toll-update",
      topic_label: "네팔 홍수 사망자 갱신",
      ai_recommend_grade: "priority",
      ai_recommend_score: 80,
      published_at: hoursAgo(3),
      source: "AP",
      original_url: "https://apnews.com/nepal-u",
    });
    const sameAngle = card({
      id: "nepal-same",
      title: "네팔·중국 접경 홍수",
      topic_key: "nepal-china-flood",
      topic_label: "네팔 홍수",
      ai_recommend_grade: "priority",
      ai_recommend_score: 78,
      published_at: hoursAgo(3.2),
      source: "Reuters",
      original_url: "https://reuters.com/nepal-s",
    });
    const third = card({
      id: "nepal-third",
      title: "네팔 홍수 정부 대응",
      topic_key: "nepal-flood-government-response",
      topic_label: "네팔 홍수 정부 대응",
      ai_recommend_grade: "priority",
      ai_recommend_score: 77,
      published_at: hoursAgo(3.5),
      source: "Yonhap",
      source_country: "KR",
      original_url: "https://yonhapnews.co.kr/nepal-t",
    });
    const other1 = card({
      id: "other-1",
      title: "미 금리 결정",
      ai_recommend_grade: "priority",
      ai_recommend_score: 70,
      published_at: hoursAgo(4),
      source: "Bloomberg",
      original_url: "https://bloomberg.com/o1",
    });
    const other2 = card({
      id: "other-2",
      title: "한국 증시",
      ai_recommend_grade: "priority",
      ai_recommend_score: 68,
      published_at: hoursAgo(4.5),
      source: "연합뉴스",
      source_country: "KR",
      original_url: "https://yonhapnews.co.kr/o2",
    });
    const other3 = card({
      id: "other-3",
      title: "EU climate bill",
      ai_recommend_grade: "normal",
      ai_recommend_score: 50,
      published_at: hoursAgo(5),
      source: "Reuters",
      original_url: "https://reuters.com/o3",
    });
    const pakistanFlood = card({
      id: "pak-flood",
      title: "Pakistan flood kills dozens",
      topic_key: "pakistan-flood",
      topic_label: "Pakistan flood",
      ai_recommend_grade: "priority",
      ai_recommend_score: 66,
      published_at: hoursAgo(5.5),
      source: "AP",
      original_url: "https://apnews.com/pak",
    });

    const side = pickSidebarLatestArticles(
      [
        featured,
        update,
        sameAngle,
        third,
        other1,
        other2,
        other3,
        pakistanFlood,
      ],
      5,
      NOW,
      { reservedCoreArticles: [featured] }
    );

    const nepalSide = side.filter(
      (a) =>
        normalizeEventFamilyKey({
          topic_key: a.topic_key,
          topic_label: a.topic_label,
          title: a.title,
        }) === "nepal-flood"
    );
    assert.ok(nepalSide.length <= 1);
    assert.ok(side.some((a) => a.id === "nepal-update"));
    assert.ok(!side.some((a) => a.id === "nepal-same"));
    assert.ok(!side.some((a) => a.id === "nepal-third"));
    assert.ok(side.some((a) => a.id === "pak-flood"));
    assert.ok(!side.some((a) => a.id === "feat-nepal"));
  });

  it("does not fill 지금 주목 with same family when other candidates are scarce", () => {
    const featured = card({
      id: "feat",
      topic_key: "nepal-flood",
      title: "네팔 홍수",
      ai_recommend_grade: "best",
      ai_recommend_score: 99,
      published_at: hoursAgo(1),
    });
    const n2 = card({
      id: "n2",
      topic_key: "nepal-flood",
      title: "네팔 홍수 추가",
      ai_recommend_grade: "priority",
      ai_recommend_score: 90,
      published_at: hoursAgo(2),
      source: "Reuters",
      original_url: "https://reuters.com/n2",
    });
    const n3 = card({
      id: "n3",
      topic_key: "nepal-flood-death-toll-update",
      title: "네팔 홍수 사망 갱신",
      ai_recommend_grade: "priority",
      ai_recommend_score: 88,
      published_at: hoursAgo(3),
      source: "AP",
      original_url: "https://apnews.com/n3",
    });
    const n4 = card({
      id: "n4",
      topic_key: "nepal-flood-government-response",
      title: "네팔 정부 대응",
      ai_recommend_grade: "priority",
      ai_recommend_score: 86,
      published_at: hoursAgo(4),
      source: "Bloomberg",
      original_url: "https://bloomberg.com/n4",
    });
    const ancient = card({
      id: "ancient",
      title: "5월 카카오",
      ai_recommend_grade: "best",
      ai_recommend_score: 99,
      is_top_story: true,
      published_at: hoursAgo(90 * 24),
      source_published_at: hoursAgo(90 * 24),
      created_at: hoursAgo(90 * 24),
    });

    const side = pickSidebarLatestArticles(
      [featured, n2, n3, n4, ancient],
      5,
      NOW,
      { reservedCoreArticles: [featured] }
    );
    assert.ok(side.length <= 1);
    assert.ok(side.every((a) => a.id !== "ancient"));
    assert.ok(!side.some((a) => a.id === "n2"));
    if (side.length === 1) {
      assert.equal(side[0]?.id, "n3");
    }
  });

  it("edition home: featured Nepal → sidebar Nepal family ≤1", () => {
    const pool = [
      card({
        id: "feat-nepal",
        article_id: "art-feat",
        title: "네팔 홍수",
        topic_key: "nepal-china-flood",
        ai_recommend_grade: "best",
        ai_recommend_score: 96,
        published_at: hoursAgo(1),
        source: "The Korea Herald",
        source_country: "KR",
        original_url: "https://koreaherald.com/f",
        thumbnail_url: "https://img/f.jpg",
      }),
      card({
        id: "n-evac",
        article_id: "art-evac",
        title: "네팔 홍수로 고립된 한국인 이송",
        topic_key: null,
        ai_recommend_grade: "priority",
        ai_recommend_score: 85,
        published_at: hoursAgo(2),
        source: "The Korea Herald",
        source_country: "KR",
        original_url: "https://koreaherald.com/e",
      }),
      card({
        id: "n-death",
        article_id: "art-death",
        title: "네팔 홍수 사망자 갱신",
        topic_key: "nepal-flood-death-toll-update",
        ai_recommend_grade: "priority",
        ai_recommend_score: 84,
        published_at: hoursAgo(2.5),
        source: "AP",
        original_url: "https://apnews.com/d",
      }),
      card({
        id: "n-gov",
        article_id: "art-gov",
        title: "네팔 정부 대응",
        topic_key: "nepal-flood-government-response",
        ai_recommend_grade: "priority",
        ai_recommend_score: 83,
        published_at: hoursAgo(3),
        source: "Reuters",
        original_url: "https://reuters.com/g",
      }),
      card({
        id: "us-1",
        article_id: "art-us1",
        title: "US rates",
        ai_recommend_grade: "priority",
        ai_recommend_score: 70,
        published_at: hoursAgo(4),
        source: "Bloomberg",
        original_url: "https://bloomberg.com/u1",
      }),
      card({
        id: "kr-1",
        article_id: "art-kr1",
        title: "한국 정치",
        ai_recommend_grade: "priority",
        ai_recommend_score: 69,
        published_at: hoursAgo(4.5),
        source: "연합뉴스",
        source_country: "KR",
        original_url: "https://yonhapnews.co.kr/k1",
      }),
      card({
        id: "us-2",
        article_id: "art-us2",
        title: "EU bill",
        ai_recommend_grade: "normal",
        ai_recommend_score: 55,
        published_at: hoursAgo(5),
        source: "AP",
        original_url: "https://apnews.com/u2",
      }),
    ];

    const sections = prepareEditionHomeSections(
      pool,
      "ko",
      { leftTitle: "KR", rightTitle: "US" },
      { nowMs: NOW }
    );
    // Meaningful UPDATE (이송 / 사망 갱신) leads the family over a thinner best headline.
    assert.ok(
      sections.featured?.id === "n-evac" || sections.featured?.id === "n-death",
      `expected Nepal UPDATE featured, got ${sections.featured?.id}`
    );
    const nepalInSidebar = sections.sidebar.filter(
      (a) =>
        normalizeEventFamilyKey({
          topic_key: a.topic_key,
          topic_label: a.topic_label,
          title: a.title,
        }) === "nepal-flood"
    );
    assert.ok(nepalInSidebar.length <= 1);
    const coreNepal = [
      sections.featured,
      ...(sections.featuredLeads ?? []).slice(1),
      ...sections.sidebar,
    ].filter(
      (a) =>
        a &&
        normalizeEventFamilyKey({
          topic_key: a.topic_key,
          topic_label: a.topic_label,
          title: a.title,
        }) === "nepal-flood"
    );
    assert.ok(coreNepal.length <= 2);
  });

  it("picks highest candidate grade then score deterministically", async () => {
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

  it("skips snapshot writes when env capability is off (no schema probe)", async () => {
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

  it("before/after: importance rises vs pure freshness ordering", async () => {
    const { sortArticlesByFreshness } = await import("./articleFreshness");
    const pool = [
      card({
        id: "fresh-normal",
        published_at: hoursAgo(0.4),
      }),
      card({
        id: "best-90",
        ai_recommend_grade: "best",
        ai_recommend_score: 90,
        published_at: hoursAgo(6),
      }),
      card({
        id: "low-18",
        ai_recommend_grade: "low",
        ai_recommend_score: 18,
        published_at: hoursAgo(0.2),
      }),
      card({
        id: "manual-issue",
        editorial_priority: "issue",
        editorial_priority_manual: true,
        published_at: hoursAgo(10),
        ai_recommend_grade: "low",
        ai_recommend_score: 10,
      }),
    ];
    const before = sortArticlesByFreshness(pool, NOW).slice(0, 5).map((a) => a.id);
    const after = sortArticlesByEditorialScore(pool, NOW)
      .slice(0, 5)
      .map((a) => a.id);
    assert.ok(before.includes("low-18") || before.includes("fresh-normal"));
    assert.ok(after.includes("manual-issue"));
    assert.ok(after.includes("best-90"));
    assert.ok(!after.slice(0, 3).includes("low-18"));
  });
});
