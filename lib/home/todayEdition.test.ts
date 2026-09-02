/**
 * Today Edition v1 fixtures — injectable nowMs, no DB.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { formatHomeRelativeTime } from "./homeRelativeTime";
import { prepareEditionHomeSections } from "./prepareEditionHomeSections";
import {
  buildTodayEdition,
  collectUsedSurfaceArticleKeys,
  filterBySitePublishAge,
  getEditionDateKey,
  isTodayArticleBySitePublish,
  pickPreviousHighlights,
  pickTodayTopStoriesColumns,
  previousHighlightsDateKeyRange,
  SPOTLIGHT_MAX_MS,
  TRENDING_MAX_MS,
} from "./todayEdition";
import type { HomeArticleCard } from "./types";

/** 2026-08-28 12:00 America/New_York (EDT) */
const NOW_AUG28_NOON_ET = Date.parse("2026-08-28T16:00:00.000Z");

/** 2026-03-08 07:30 UTC — US spring-forward DST morning in New York */
const NOW_DST_SPRING = Date.parse("2026-03-08T07:30:00.000Z");

function card(
  overrides: Partial<HomeArticleCard> & Pick<HomeArticleCard, "id">
): HomeArticleCard {
  return {
    title: "기사 제목",
    summary: "요약",
    slug: overrides.id,
    created_at: new Date(NOW_AUG28_NOON_ET - 2 * 3600_000).toISOString(),
    source: "AP",
    category: "politics",
    published_at: new Date(NOW_AUG28_NOON_ET - 2 * 3600_000).toISOString(),
    source_published_at: new Date(NOW_AUG28_NOON_ET - 2 * 3600_000).toISOString(),
    thumbnail_url: null,
    title_original: "Article title",
    source_country: "US",
    ...overrides,
  };
}

function nyTodayAt(hourEt: number, minute = 0): string {
  // 2026-08-28 EDT: UTC = ET + 4
  return new Date(
    Date.UTC(2026, 7, 28, hourEt + 4, minute, 0)
  ).toISOString();
}

function nyDaysAgoAt(days: number, hourEt = 10, minute = 0): string {
  const d = new Date(NOW_AUG28_NOON_ET);
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hourEt + 4, minute, 0, 0);
  return d.toISOString();
}

describe("todayEdition", () => {
  it("uses Hannoon published_at NY date — not source_published_at", () => {
    const editionKey = getEditionDateKey(NOW_AUG28_NOON_ET);
    assert.equal(editionKey, "2026-08-28");

    const siteToday = card({
      id: "site-today",
      published_at: nyTodayAt(8, 24),
      source_published_at: nyDaysAgoAt(1, 8),
    });
    assert.equal(isTodayArticleBySitePublish(siteToday, editionKey), true);

    const siteYesterday = card({
      id: "site-yesterday",
      published_at: nyDaysAgoAt(1, 8),
      source_published_at: nyTodayAt(8),
    });
    assert.equal(isTodayArticleBySitePublish(siteYesterday, editionKey), false);
  });

  it("UTC same calendar day but different NY date at boundary", () => {
    // 2026-08-28 04:00 UTC = Aug 28 00:00 EDT — NY "today"
    const now = Date.parse("2026-08-28T04:00:00.000Z");
    const editionKey = getEditionDateKey(now);
    assert.equal(editionKey, "2026-08-28");

    // 2026-08-28 03:00 UTC = Aug 27 23:00 EDT — still NY "yesterday"
    const publishedNyYesterday = card({
      id: "ny-yesterday",
      published_at: "2026-08-28T03:00:00.000Z",
    });
    assert.equal(
      isTodayArticleBySitePublish(publishedNyYesterday, editionKey),
      false
    );
  });

  it("handles DST spring-forward date key", () => {
    const editionKey = getEditionDateKey(NOW_DST_SPRING);
    assert.equal(editionKey, "2026-03-08");

    const todayDst = card({
      id: "dst-today",
      published_at: "2026-03-08T12:00:00.000Z",
    });
    assert.equal(isTodayArticleBySitePublish(todayDst, editionKey), true);
  });

  it("0 today articles → carryover featured from yesterday edition", () => {
    const articles = [
      card({
        id: "yesterday-top",
        is_top_story: true,
        published_at: nyDaysAgoAt(1, 9),
        source_published_at: nyDaysAgoAt(1, 9),
        ai_recommend_grade: "best",
      }),
      card({
        id: "old",
        published_at: nyDaysAgoAt(3),
        source_published_at: nyDaysAgoAt(3),
      }),
    ];

    const edition = buildTodayEdition(articles, { nowMs: NOW_AUG28_NOON_ET });
    assert.equal(edition.status, "carryover");
    assert.equal(edition.todayCount, 0);
    assert.ok(edition.featured);
    assert.equal(edition.featured?.id, "yesterday-top");
    assert.match(edition.statusLineKo, /0건 · 뉴스 준비 중/);
  });

  it("0 today articles and no prior edition → preparing with no featured", () => {
    const edition = buildTodayEdition([], { nowMs: NOW_AUG28_NOON_ET });
    assert.equal(edition.status, "preparing");
    assert.equal(edition.todayCount, 0);
    assert.equal(edition.featured, null);
    assert.equal(edition.secondaryFeatured, null);
  });

  it("1 today article → featured + prior eligible secondary", () => {
    const articles = [
      card({
        id: "today-only",
        published_at: nyTodayAt(8, 10),
        ai_recommend_grade: "best",
      }),
      card({
        id: "yesterday",
        published_at: nyDaysAgoAt(1),
        is_top_story: true,
      }),
    ];

    const edition = buildTodayEdition(articles, { nowMs: NOW_AUG28_NOON_ET });
    assert.equal(edition.todayCount, 1);
    assert.equal(edition.featured?.id, "today-only");
    assert.equal(edition.secondaryFeatured?.id, "yesterday");
    assert.notEqual(edition.featured?.id, edition.secondaryFeatured?.id);
  });

  it("2+ today articles → featured + secondary", () => {
    const articles = [
      card({
        id: "today-a",
        published_at: nyTodayAt(7),
        ai_recommend_grade: "best",
        topic_key: "event-a",
      }),
      card({
        id: "today-b",
        published_at: nyTodayAt(9),
        ai_recommend_grade: "priority",
        topic_key: "event-b",
        title: "다른 각도 기사",
        summary: "analysis angle context",
      }),
    ];

    const edition = buildTodayEdition(articles, { nowMs: NOW_AUG28_NOON_ET });
    assert.equal(edition.todayCount, 2);
    assert.ok(edition.featured);
    assert.ok(edition.secondaryFeatured);
    assert.notEqual(edition.featured.id, edition.secondaryFeatured.id);
  });

  it("yesterday top story does not become today featured", () => {
    const articles = [
      card({
        id: "yesterday-pin",
        is_top_story: true,
        top_story_order: 1,
        published_at: nyDaysAgoAt(1, 6),
        ai_recommend_grade: "best",
      }),
      card({
        id: "today-normal",
        published_at: nyTodayAt(10),
        ai_recommend_grade: "normal",
      }),
    ];

    const edition = buildTodayEdition(articles, { nowMs: NOW_AUG28_NOON_ET });
    assert.equal(edition.featured?.id, "today-normal");
  });

  it("spotlight prefers 24h articles then backfills from 7-day eligible pool", () => {
    const articles = [
      card({
        id: "today-spot",
        published_at: nyTodayAt(11),
      }),
      card({
        id: "today-second",
        published_at: nyTodayAt(9),
        ai_recommend_grade: "normal",
      }),
      card({
        id: "within-24h",
        published_at: new Date(NOW_AUG28_NOON_ET - 20 * 3600_000).toISOString(),
      }),
      card({
        id: "week-old",
        published_at: nyDaysAgoAt(8),
      }),
    ];

    const edition = buildTodayEdition(articles, { nowMs: NOW_AUG28_NOON_ET });
    const ids = edition.spotlight.map((a) => a.id);
    assert.ok(ids.includes("within-24h"));
    assert.ok(!ids.includes("week-old"));
  });

  it("trending excludes articles older than 48h", () => {
    const articles = [
      card({
        id: "recent-topic-a",
        topic_key: "crisis",
        topic_label: "진행 위기",
        title: "missing persons search continues",
        summary: "officials say search for missing continues",
        published_at: new Date(NOW_AUG28_NOON_ET - 40 * 3600_000).toISOString(),
      }),
      card({
        id: "recent-topic-b",
        topic_key: "crisis",
        topic_label: "진행 위기",
        title: "update on missing",
        summary: "search ongoing",
        published_at: new Date(NOW_AUG28_NOON_ET - 36 * 3600_000).toISOString(),
      }),
      card({
        id: "ancient",
        topic_key: "old",
        published_at: new Date(NOW_AUG28_NOON_ET - 72 * 3600_000).toISOString(),
      }),
    ];

    const edition = buildTodayEdition(articles, {
      nowMs: NOW_AUG28_NOON_ET,
      locale: "ko",
    });
    const allIssueSlugs = [
      ...(edition.trending?.us ?? []),
      ...(edition.trending?.kr ?? []),
    ].flatMap((i) => [
      i.primaryArticle?.slug,
      ...i.relatedArticles.map((r) => r.slug),
    ]);
    assert.ok(!allIssueSlugs.includes("ancient"));
  });

  it("previous highlights include yesterday through 7 NY days ago", () => {
    const editionKey = getEditionDateKey(NOW_AUG28_NOON_ET);
    const range = previousHighlightsDateKeyRange(editionKey);
    assert.equal(range.maxKey, "2026-08-27");
    assert.equal(range.minKey, "2026-08-21");

    const articles = [
      card({ id: "d1", published_at: nyDaysAgoAt(1), ai_recommend_grade: "priority" }),
      card({
        id: "d3",
        published_at: nyDaysAgoAt(3),
        ai_recommend_grade: "normal",
      }),
      card({ id: "d8", published_at: nyDaysAgoAt(8) }),
    ];

    const picks = pickPreviousHighlights(articles, editionKey, NOW_AUG28_NOON_ET);
    const ids = picks.map((a) => a.id);
    assert.ok(ids.includes("d1"));
    assert.ok(ids.includes("d3"));
    assert.ok(!ids.includes("d8"));
    assert.ok(picks.length <= 5);
  });

  it("25h-old article is excluded from spotlight but included in previous highlights", () => {
    const editionKey = getEditionDateKey(NOW_AUG28_NOON_ET);
    const published25h = new Date(
      NOW_AUG28_NOON_ET - 25 * 3600_000
    ).toISOString();

    const articles = [
      card({
        id: "yesterday-spotlight-candidate",
        published_at: published25h,
        ai_recommend_grade: "priority",
      }),
    ];

    const edition = buildTodayEdition(articles, { nowMs: NOW_AUG28_NOON_ET });
    assert.equal(edition.spotlight.length, 0);

    const picks = pickPreviousHighlights(articles, editionKey, NOW_AUG28_NOON_ET);
    assert.ok(picks.some((a) => a.id === "yesterday-spotlight-candidate"));
  });

  it("previous highlights exclude today and already-used surface articles", () => {
    const editionKey = getEditionDateKey(NOW_AUG28_NOON_ET);
    const articles = [
      card({ id: "today-used", published_at: nyTodayAt(8) }),
      card({ id: "yesterday-a", published_at: nyDaysAgoAt(1), ai_recommend_grade: "best" }),
      card({ id: "yesterday-b", published_at: nyDaysAgoAt(1, 11), ai_recommend_grade: "priority" }),
    ];

    const edition = buildTodayEdition(articles, { nowMs: NOW_AUG28_NOON_ET });
    const ids = edition.previousHighlights.map((a) => a.id);
    assert.ok(!ids.includes("today-used"));
    if (edition.featured?.id === "yesterday-a") {
      assert.ok(!ids.includes("yesterday-a"));
    }
  });

  it("pickTodayTopStoriesColumns uses only unused today articles split by region", () => {
    const articles = [
      card({
        id: "today-kr-1",
        published_at: nyTodayAt(7),
        source: "연합뉴스",
        source_country: "KR",
        original_url: "https://www.yna.co.kr/a",
        ai_recommend_grade: "best",
      }),
      card({
        id: "today-kr-2",
        published_at: nyTodayAt(8),
        source: "조선일보",
        source_country: "KR",
        original_url: "https://www.chosun.com/a",
        ai_recommend_grade: "priority",
      }),
      card({
        id: "today-us-1",
        published_at: nyTodayAt(9),
        source: "AP",
        source_country: "US",
        ai_recommend_grade: "priority",
      }),
      card({
        id: "yesterday-fill",
        published_at: nyDaysAgoAt(1),
        source: "AP",
        source_country: "US",
        ai_recommend_grade: "best",
      }),
    ];

    const edition = buildTodayEdition(articles, { nowMs: NOW_AUG28_NOON_ET });
    const exclude = new Set<string>();
    if (edition.featured) exclude.add(edition.featured.id);
    if (edition.secondaryFeatured) exclude.add(edition.secondaryFeatured.id);

    const columns = pickTodayTopStoriesColumns(
      edition.todayArticles,
      "ko",
      { leftTitle: "한국 기사", rightTitle: "영어 · 미국 기사" },
      NOW_AUG28_NOON_ET,
      { excludeKeys: exclude }
    );

    assert.ok(columns);
    const allIds = [...columns!.left, ...columns!.right].map((a) => a.id);
    assert.ok(allIds.every((id) => id.startsWith("today-")));
    assert.ok(!allIds.includes("yesterday-fill"));
    assert.ok(columns!.left.every((a) => a.source_country === "KR" || a.original_url?.includes("yna") || a.original_url?.includes("chosun")));
  });

  it("pickTodayTopStoriesColumns returns null when no unused today candidates", () => {
    const articles = [
      card({ id: "only-one", published_at: nyTodayAt(8), ai_recommend_grade: "best" }),
    ];
    const edition = buildTodayEdition(articles, { nowMs: NOW_AUG28_NOON_ET });
    const exclude = new Set([edition.featured!.id]);

    const columns = pickTodayTopStoriesColumns(
      edition.todayArticles,
      "ko",
      { leftTitle: "KR", rightTitle: "US" },
      NOW_AUG28_NOON_ET,
      { excludeKeys: exclude }
    );
    assert.equal(columns, null);
  });

  it("prepareEditionHomeSections restores topStories for extra today articles", () => {
    const articles = [
      card({
        id: "today-kr-featured",
        published_at: nyTodayAt(7),
        source: "연합뉴스",
        source_country: "KR",
        original_url: "https://www.yna.co.kr/lead",
        ai_recommend_grade: "best",
      }),
      card({
        id: "today-kr-secondary",
        published_at: nyTodayAt(7, 30),
        source: "조선일보",
        source_country: "KR",
        original_url: "https://www.chosun.com/secondary",
        ai_recommend_grade: "priority",
        topic_key: "kr-event-b",
        title: "Different angle secondary",
        summary: "analysis from another outlet",
      }),
      card({
        id: "today-kr-extra",
        published_at: nyTodayAt(8),
        source: "한겨레",
        source_country: "KR",
        original_url: "https://www.hani.co.kr/extra",
        ai_recommend_grade: "normal",
      }),
      card({
        id: "today-us-extra",
        published_at: nyTodayAt(9),
        source: "AP",
        source_country: "US",
        ai_recommend_grade: "normal",
      }),
      card({
        id: "today-us-more",
        published_at: nyTodayAt(10),
        source: "Reuters",
        source_country: "US",
        ai_recommend_grade: "normal",
        topic_key: "us-trade",
        title: "Trade talks continue",
        summary: "negotiations ongoing",
      }),
      card({
        id: "today-us-tail",
        published_at: nyTodayAt(11),
        source: "NYT",
        source_country: "US",
        ai_recommend_grade: "normal",
        topic_key: "us-policy",
        title: "Policy update today",
        summary: "latest from Washington",
      }),
      card({
        id: "today-kr-column",
        published_at: nyTodayAt(12),
        source: "KBS",
        source_country: "KR",
        original_url: "https://news.kbs.co.kr/column",
        ai_recommend_grade: "normal",
        topic_key: "kr-culture",
        title: "Culture story today",
        summary: "Korea culture desk",
      }),
      card({
        id: "today-us-column",
        published_at: nyTodayAt(13),
        source: "WSJ",
        source_country: "US",
        ai_recommend_grade: "normal",
        topic_key: "us-markets",
        title: "Markets wrap today",
        summary: "Wall Street close",
      }),
    ];

    const sections = prepareEditionHomeSections(
      articles,
      "ko",
      { leftTitle: "한국 기사", rightTitle: "영어 · 미국 기사" },
      { nowMs: NOW_AUG28_NOON_ET }
    );

    assert.ok(sections.topStories);
    const usedInHero = new Set([
      ...(sections.featuredLeads ?? []).map((a) => a.id),
      ...(sections.featuredRelated ?? []).map((a) => a.id),
    ]);
    const columnIds = [
      ...(sections.topStories?.left ?? []),
      ...(sections.topStories?.right ?? []),
    ].map((a) => a.id);
    assert.ok(columnIds.every((id) => !usedInHero.has(id)));
    assert.ok(columnIds.length > 0);
    assert.ok(columnIds.every((id) => id.startsWith("today-")));
  });

  it("7+ day articles excluded from today featured and spotlight backfill", () => {
    const articles = [
      card({
        id: "week-old-best",
        ai_recommend_grade: "best",
        published_at: nyDaysAgoAt(8),
      }),
    ];

    const edition = buildTodayEdition(articles, { nowMs: NOW_AUG28_NOON_ET });
    assert.equal(edition.featured, null);
    assert.equal(edition.spotlight.length, 0);
  });

  it("KO and EN edition share the same todayCount policy", () => {
    const articles = [
      card({ id: "t1", published_at: nyTodayAt(8) }),
      card({ id: "t2", published_at: nyTodayAt(9) }),
    ];
    const ko = buildTodayEdition(articles, {
      nowMs: NOW_AUG28_NOON_ET,
      locale: "ko",
    });
    const en = buildTodayEdition(articles, {
      nowMs: NOW_AUG28_NOON_ET,
      locale: "en",
    });
    assert.equal(ko.todayCount, en.todayCount);
    assert.equal(ko.featured?.id, en.featured?.id);
    assert.equal(ko.status, en.status);
  });

  it("prepareEditionHomeSections keeps two featured leads when today has one story", () => {
    const articles = [
      card({
        id: "today-only",
        published_at: nyTodayAt(8, 10),
        ai_recommend_grade: "best",
      }),
      card({
        id: "yesterday",
        published_at: nyDaysAgoAt(1),
        is_top_story: true,
      }),
    ];
    const sections = prepareEditionHomeSections(
      articles,
      "ko",
      { leftTitle: "L", rightTitle: "R" },
      { nowMs: NOW_AUG28_NOON_ET }
    );
    assert.equal(sections.featuredLeads?.length, 2);
    assert.equal(sections.featuredLeads?.[0]?.id, "today-only");
    assert.equal(sections.featuredLeads?.[1]?.id, "yesterday");
    const leadIds = sections.featuredLeads!.map((a) => a.id);
    assert.equal(new Set(leadIds).size, leadIds.length);
  });

  it("prepareEditionHomeSections carryover keeps two featured leads from prior edition", () => {
    const articles = [
      card({
        id: "yesterday-a",
        published_at: nyDaysAgoAt(1, 8),
        ai_recommend_grade: "best",
        topic_key: "event-a",
      }),
      card({
        id: "yesterday-b",
        published_at: nyDaysAgoAt(1, 10),
        ai_recommend_grade: "priority",
        topic_key: "event-b",
        title: "Second lead angle",
      }),
    ];
    const sections = prepareEditionHomeSections(
      articles,
      "ko",
      { leftTitle: "L", rightTitle: "R" },
      { nowMs: NOW_AUG28_NOON_ET }
    );
    assert.equal(sections.todayEdition?.status, "carryover");
    assert.equal(sections.featuredLeads?.length, 2);
    assert.notEqual(sections.featuredLeads?.[0]?.id, sections.featuredLeads?.[1]?.id);
  });

  it("allows a single featured lead when only one eligible article exists", () => {
    const articles = [
      card({
        id: "solo",
        published_at: nyTodayAt(8),
        ai_recommend_grade: "best",
      }),
    ];
    const edition = buildTodayEdition(articles, { nowMs: NOW_AUG28_NOON_ET });
    assert.equal(edition.todayCount, 1);
    assert.equal(edition.featured?.id, "solo");
    assert.equal(edition.secondaryFeatured, null);

    const sections = prepareEditionHomeSections(
      articles,
      "ko",
      { leftTitle: "L", rightTitle: "R" },
      { nowMs: NOW_AUG28_NOON_ET }
    );
    assert.equal(sections.featuredLeads?.length, 1);
  });

  it("KO and EN featured leads share article ids", () => {
    const articles = [
      card({
        id: "today-a",
        published_at: nyTodayAt(7),
        ai_recommend_grade: "best",
        topic_key: "event-a",
      }),
      card({
        id: "today-b",
        published_at: nyTodayAt(9),
        ai_recommend_grade: "priority",
        topic_key: "event-b",
      }),
    ];
    const ko = prepareEditionHomeSections(
      articles,
      "ko",
      { leftTitle: "L", rightTitle: "R" },
      { nowMs: NOW_AUG28_NOON_ET }
    );
    const en = prepareEditionHomeSections(
      articles,
      "en",
      { leftTitle: "L", rightTitle: "R" },
      { nowMs: NOW_AUG28_NOON_ET }
    );
    assert.deepEqual(
      ko.featuredLeads?.map((a) => a.id),
      en.featuredLeads?.map((a) => a.id)
    );
  });

  it("spotlight backfills from 7-day eligible pool when 24h rail is thin", () => {
    const articles = [
      card({
        id: "today-featured",
        published_at: nyTodayAt(8),
        ai_recommend_grade: "best",
      }),
      card({
        id: "three-days-ago",
        published_at: nyDaysAgoAt(3, 10),
        ai_recommend_grade: "normal",
      }),
      card({
        id: "five-days-ago",
        published_at: nyDaysAgoAt(5, 10),
        ai_recommend_grade: "normal",
      }),
    ];
    const edition = buildTodayEdition(articles, { nowMs: NOW_AUG28_NOON_ET });
    const sidebarIds = edition.spotlight.map((a) => a.id);
    assert.ok(sidebarIds.includes("three-days-ago") || sidebarIds.includes("five-days-ago"));
    const featuredKeys = new Set(
      [edition.featured, edition.secondaryFeatured]
        .filter(Boolean)
        .map((a) => a!.id)
    );
    assert.ok(sidebarIds.every((id) => !featuredKeys.has(id)));
  });

  it("prepareEditionHomeSections wires today edition meta", () => {
    const articles = [card({ id: "t1", published_at: nyTodayAt(8, 24) })];
    const sections = prepareEditionHomeSections(articles, "ko", {
      leftTitle: "L",
      rightTitle: "R",
    }, { nowMs: NOW_AUG28_NOON_ET });

    assert.ok(sections.todayEdition);
    assert.equal(sections.todayEdition?.todayCount, 1);
    assert.equal(sections.featured?.id, "t1");
    assert.equal(sections.featuredLeads?.length, 1);
    assert.equal(sections.topStories, null);
  });

  it("formatHomeRelativeTime uses NY today/yesterday labels", () => {
    const published = nyTodayAt(8, 10);
    const ko = formatHomeRelativeTime(published, "ko", NOW_AUG28_NOON_ET);
    assert.match(ko, /^오늘 /);

    const yesterday = formatHomeRelativeTime(
      nyDaysAgoAt(1, 18, 40),
      "ko",
      NOW_AUG28_NOON_ET
    );
    assert.match(yesterday, /^어제 /);

    const en = formatHomeRelativeTime(published, "en", NOW_AUG28_NOON_ET);
    assert.match(en, /^Today /);
  });
});

describe("home layout — today edition mobile order", () => {
  it("documents mobile order: header → featured → trending → spotlight → previous → sources → categories", () => {
    const view = readFileSync(
      join(process.cwd(), "components/home/HomeNewsView.tsx"),
      "utf8"
    );
    assert.match(view, /TodayEditionHeader/);
    assert.match(view, /PreviousHighlightsSection/);
    assert.match(view, /TodayEditionPreparing/);
    assert.match(view, /id="featured"[\s\S]*order-1/);
    assert.match(view, /order-2 min-w-0 xl:order-none xl:row-start-2 xl:row-span-2/);
    assert.match(view, /homeRightRailColClass/);
    assert.match(view, /order-3 min-w-0 xl:order-none xl:row-start-2/);
    assert.match(view, /homeLeftRailColClass/);
    assert.match(view, /order-4 min-w-0 scroll-mt-6/);
    assert.match(view, /order-5 min-w-0 scroll-mt-6/);
    assert.match(view, /order-6 min-w-0 scroll-mt-6/);
    assert.match(view, /role="tablist"/);
    assert.doesNotMatch(view, /lg:sticky|sticky |fixed |position:\s*sticky/);
  });
});
