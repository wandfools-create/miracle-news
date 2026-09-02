/**
 * Production-shaped home regression fixtures (anonymized).
 * Mirrors the 2026-09-02 NY carryover case: prior edition day has 1 article,
 * while many eligible articles exist on earlier days.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  pickHomeSourceLeadMap,
  sortHomeCategoryArticlesForDisplay,
} from "./homeArchiveDisplay";
import { prepareEditionHomeSections } from "./prepareEditionHomeSections";
import { buildTodayEdition } from "./todayEdition";
import type { HomeArticleCard } from "./types";

/** 2026-09-02 12:00 America/New_York (EDT) */
const NOW = Date.parse("2026-09-02T16:00:00.000Z");

function card(
  overrides: Partial<HomeArticleCard> & Pick<HomeArticleCard, "id">
): HomeArticleCard {
  return {
    title: "기사 제목",
    summary: "요약",
    slug: overrides.id,
    created_at: overrides.published_at ?? "2026-08-31T12:00:00.000Z",
    source: "AP",
    category: "politics",
    published_at: "2026-08-31T12:00:00.000Z",
    source_published_at: "2026-08-30T12:00:00.000Z",
    thumbnail_url: null,
    title_original: "Article title",
    source_country: "US",
    article_id: overrides.id,
    ...overrides,
  };
}

describe("production-shaped home two-card regression", () => {
  it("prior edition day has 1 core article but pool has many → featured leads are 2", () => {
    const articles = [
      card({
        id: "prior-day-only",
        published_at: "2026-09-01T04:20:00.000Z", // NY Sep 1
        source: "bbc",
        ai_recommend_grade: "best",
      }),
      card({
        id: "batch-a",
        published_at: "2026-09-01T01:11:00.000Z", // NY Aug 31
        source: "joongang",
        category: "economy",
      }),
      card({
        id: "batch-b",
        published_at: "2026-09-01T01:11:05.000Z",
        source: "chosun",
        category: "politics",
      }),
      card({
        id: "older-high-score",
        published_at: "2026-08-30T18:00:00.000Z",
        source: "fox-news",
        category: "society",
        ai_recommend_grade: "best",
        is_top_story: true,
      }),
      card({
        id: "rail-fill-a",
        published_at: "2026-08-31T12:00:00.000Z",
        source: "ap",
        category: "world",
      }),
      card({
        id: "rail-fill-b",
        published_at: "2026-08-31T10:00:00.000Z",
        source: "bbc",
        category: "world",
      }),
    ];

    const edition = buildTodayEdition(articles, { nowMs: NOW, locale: "ko" });
    assert.equal(edition.todayCount, 0);
    assert.equal(edition.status, "carryover");
    assert.equal(edition.featured?.id, "prior-day-only");
    assert.ok(edition.secondaryFeatured);
    assert.notEqual(edition.featured?.id, edition.secondaryFeatured?.id);

    const sections = prepareEditionHomeSections(
      articles,
      "ko",
      { leftTitle: "L", rightTitle: "R" },
      { nowMs: NOW }
    );
    assert.equal(sections.featuredLeads?.length, 2);
    assert.ok(sections.sidebar.length > 0);
  });

  it("today has several published but only 1 core-eligible → still fills second card", () => {
    const articles = [
      card({
        id: "today-core",
        published_at: "2026-09-02T14:00:00.000Z",
        ai_recommend_grade: "best",
      }),
      card({
        id: "today-thin",
        published_at: "2026-09-02T13:00:00.000Z",
        ai_recommend_grade: "normal",
      }),
      card({
        id: "yesterday",
        published_at: "2026-09-01T15:00:00.000Z",
        ai_recommend_grade: "priority",
      }),
    ];
    const sections = prepareEditionHomeSections(
      articles,
      "ko",
      { leftTitle: "L", rightTitle: "R" },
      { nowMs: NOW }
    );
    assert.ok((sections.featuredLeads?.length ?? 0) >= 2);
    const ids = sections.featuredLeads!.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("today 1 + recent many → featured leads are 2", () => {
    const articles = [
      card({
        id: "today-only",
        published_at: "2026-09-02T12:00:00.000Z",
        ai_recommend_grade: "best",
      }),
      card({
        id: "y1",
        published_at: "2026-09-01T10:00:00.000Z",
        is_top_story: true,
      }),
      card({
        id: "y2",
        published_at: "2026-08-31T10:00:00.000Z",
      }),
    ];
    const sections = prepareEditionHomeSections(
      articles,
      "ko",
      { leftTitle: "L", rightTitle: "R" },
      { nowMs: NOW }
    );
    assert.equal(sections.featuredLeads?.length, 2);
    assert.equal(sections.featuredLeads?.[0]?.id, "today-only");
    assert.notEqual(sections.featuredLeads?.[1]?.id, "today-only");
  });

  it("newer published_at wins category top over older high editorial score", () => {
    const articles = [
      card({
        id: "old-scored",
        published_at: "2026-08-30T06:00:00.000Z",
        source_published_at: "2026-08-30T05:00:00.000Z",
        source: "insight",
        category: "politics",
        ai_recommend_grade: "best",
        is_top_story: true,
      }),
      card({
        id: "new-batch",
        published_at: "2026-09-01T01:11:00.000Z",
        source_published_at: "2026-08-31T20:00:00.000Z",
        source: "joongang",
        category: "politics",
        ai_recommend_grade: "normal",
      }),
    ];
    const ranked = sortHomeCategoryArticlesForDisplay(articles, "politics", NOW);
    assert.equal(ranked[0]?.id, "new-batch");
  });

  it("newer same-day article wins category lead despite source and editorial rank", () => {
    const articles = [
      card({
        id: "older-preferred",
        published_at: "2026-09-01T18:00:00.000Z",
        source: "chosun",
        category: "politics",
        ai_recommend_grade: "best",
        is_top_story: true,
      }),
      card({
        id: "newer-normal",
        published_at: "2026-09-01T18:30:00.000Z",
        source: "ap",
        category: "politics",
        ai_recommend_grade: "normal",
      }),
    ];
    const sections = prepareEditionHomeSections(
      articles,
      "ko",
      { leftTitle: "L", rightTitle: "R" },
      { nowMs: NOW }
    );
    assert.equal(sections.groupedByCategory.politics?.[0]?.id, "newer-normal");
  });

  it("same source: today publish beats 2-day-old as source lead", () => {
    const articles = [
      card({
        id: "old-chosun",
        published_at: "2026-08-30T18:00:00.000Z",
        source: "chosun",
        ai_recommend_grade: "best",
      }),
      card({
        id: "new-chosun",
        published_at: "2026-09-01T01:11:00.000Z",
        source: "chosun",
        ai_recommend_grade: "normal",
      }),
    ];
    const map = pickHomeSourceLeadMap(articles, NOW);
    assert.equal(map.chosun?.id, "new-chosun");
  });

  it("spotlight fills left rail from 7-day pool when 24h is thin", () => {
    const articles = [
      card({
        id: "feat",
        published_at: "2026-09-01T04:20:00.000Z",
        ai_recommend_grade: "best",
      }),
      card({
        id: "rail-a",
        published_at: "2026-08-30T12:00:00.000Z",
        source: "ap",
      }),
      card({
        id: "rail-b",
        published_at: "2026-08-29T12:00:00.000Z",
        source: "bbc",
      }),
      card({
        id: "rail-c",
        published_at: "2026-08-28T12:00:00.000Z",
        source: "joongang",
      }),
    ];
    const edition = buildTodayEdition(articles, { nowMs: NOW, locale: "ko" });
    assert.ok(edition.spotlight.length >= 1);
    const leadKeys = new Set(
      [edition.featured, edition.secondaryFeatured]
        .filter(Boolean)
        .map((a) => a!.id)
    );
    assert.ok(edition.spotlight.every((a) => !leadKeys.has(a.id)));
  });

  it("KO/EN featured and secondary article_ids match", () => {
    const articles = [
      card({
        id: "a1",
        published_at: "2026-09-01T04:20:00.000Z",
        ai_recommend_grade: "best",
      }),
      card({
        id: "a2",
        published_at: "2026-09-01T01:11:00.000Z",
        ai_recommend_grade: "priority",
      }),
      card({
        id: "a3",
        published_at: "2026-08-31T12:00:00.000Z",
      }),
    ];
    const ko = prepareEditionHomeSections(
      articles,
      "ko",
      { leftTitle: "L", rightTitle: "R" },
      { nowMs: NOW }
    );
    const en = prepareEditionHomeSections(
      articles,
      "en",
      { leftTitle: "L", rightTitle: "R" },
      { nowMs: NOW }
    );
    assert.deepEqual(
      ko.featuredLeads?.map((a) => a.article_id ?? a.id),
      en.featuredLeads?.map((a) => a.article_id ?? a.id)
    );
  });

  it("desktop keeps 3-col grid helpers; mobile stack order preserved", () => {
    const view = readFileSync(
      join(process.cwd(), "components/home/HomeNewsView.tsx"),
      "utf8"
    );
    assert.match(view, /shouldUseNewspaperThreeColGrid/);
    assert.match(view, /newsHomeThreeColGrid/);
    assert.doesNotMatch(view, /newsHomeRightOnlyGrid/);
    assert.match(view, /id="featured"[\s\S]*order-1/);
    assert.match(view, /order-2 min-w-0 xl:order-none/);
    assert.match(view, /order-3 min-w-0 xl:order-none/);
  });
});
