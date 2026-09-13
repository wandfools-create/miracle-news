/**
 * Public News Wire — fixture tests only (no DB / OpenAI / RSS).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  compareNewsWireItems,
  newsWireRankBucket,
  type NewsWireSortable,
} from "@/lib/news-wire/rankNewsWire";
import {
  newsWireIdOrder,
  nyDateKeyBounds,
  paginateNewsWireItems,
  parseNewsWirePage,
  rankDbRowsToPublicItems,
  selectHomeNewsWireItems,
} from "@/lib/news-wire/newsWireQuery";
import type { NewsWireDbRow } from "@/lib/news-wire/types";
import {
  displayOriginalWireTitle,
  sanitizeWireOutboundUrl,
} from "@/lib/news-wire/wireTitles";

function dbRow(
  partial: Partial<NewsWireDbRow> & Pick<NewsWireDbRow, "id" | "created_at">
): NewsWireDbRow {
  return {
    source: partial.source ?? "ap",
    feed_label: partial.feed_label ?? "AP",
    original_url: partial.original_url ?? `https://example.com/${partial.id}`,
    rss_title: partial.rss_title ?? "Original RSS headline",
    rss_published_at: partial.rss_published_at ?? partial.created_at,
    status: partial.status ?? "pending",
    article_id: partial.article_id ?? null,
    ai_recommend_grade: partial.ai_recommend_grade ?? null,
    ai_recommend_score: partial.ai_recommend_score ?? null,
    ...partial,
  };
}

function sortKey(
  partial: Partial<NewsWireSortable> &
    Pick<NewsWireSortable, "id" | "collectedAt">
): NewsWireSortable {
  return {
    aiRecommendGrade: partial.aiRecommendGrade ?? null,
    aiRecommendScore: partial.aiRecommendScore ?? null,
    publishedAt: partial.publishedAt ?? partial.collectedAt,
    ...partial,
  };
}

describe("news wire original titles", () => {
  it("shows original rss_title on both KO and EN", () => {
    const hangul = { rss_title: "서울에서 회담" };
    const latin = { rss_title: "Seoul summit" };
    assert.equal(displayOriginalWireTitle(hangul), "서울에서 회담");
    assert.equal(displayOriginalWireTitle(latin), "Seoul summit");
    const now = Date.parse("2026-09-12T12:00:00.000Z");
    const rows = [
      dbRow({
        id: "ko-native",
        created_at: "2026-09-12T10:00:00.000Z",
        rss_title: "서울에서 회담",
      }),
      dbRow({
        id: "en-native",
        created_at: "2026-09-12T11:00:00.000Z",
        rss_title: "Seoul summit",
      }),
    ];
    const ko = rankDbRowsToPublicItems(rows, "ko", now);
    const en = rankDbRowsToPublicItems(rows, "en", now);
    assert.deepEqual(
      ko.map((i) => i.title),
      ["Seoul summit", "서울에서 회담"]
    );
    assert.deepEqual(
      en.map((i) => i.title),
      ["Seoul summit", "서울에서 회담"]
    );
    assert.deepEqual(newsWireIdOrder(ko), newsWireIdOrder(en));
  });

  it("exposes active candidates immediately without translation readiness", () => {
    const now = Date.parse("2026-09-12T12:00:00.000Z");
    const home = selectHomeNewsWireItems(
      [
        dbRow({
          id: "raw",
          created_at: "2026-09-12T11:00:00.000Z",
          rss_title: "Untranslated English only",
        }),
      ],
      "ko",
      now
    );
    assert.equal(home.length, 1);
    assert.equal(home[0]?.title, "Untranslated English only");
  });

  it("sanitizes outbound URLs to http(s) only", () => {
    assert.equal(sanitizeWireOutboundUrl("https://ex.com/a"), "https://ex.com/a");
    assert.equal(sanitizeWireOutboundUrl("javascript:alert(1)"), null);
    assert.equal(sanitizeWireOutboundUrl("ftp://x"), null);
  });
});

describe("news wire ranking + home selection", () => {
  it("keeps KO/EN id order identical after sort", () => {
    const now = Date.parse("2026-09-11T12:00:00.000Z");
    const rows = [
      sortKey({
        id: "low-old",
        collectedAt: "2026-09-11T01:00:00.000Z",
        aiRecommendGrade: "low",
        aiRecommendScore: 10,
      }),
      sortKey({
        id: "priority",
        collectedAt: "2026-09-11T02:00:00.000Z",
        aiRecommendGrade: "priority",
        aiRecommendScore: 80,
      }),
      sortKey({
        id: "uneval-recent",
        collectedAt: "2026-09-11T11:30:00.000Z",
        aiRecommendGrade: null,
      }),
      sortKey({
        id: "normal",
        collectedAt: "2026-09-11T03:00:00.000Z",
        aiRecommendGrade: "normal",
        aiRecommendScore: 50,
      }),
      sortKey({
        id: "uneval-old",
        collectedAt: "2026-09-10T12:00:00.000Z",
        aiRecommendGrade: null,
      }),
    ];
    const sorted = [...rows].sort((a, b) => compareNewsWireItems(a, b, now));
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["priority", "uneval-recent", "normal", "uneval-old", "low-old"]
    );
    assert.equal(
      newsWireRankBucket(
        { aiRecommendGrade: "low", createdAt: rows[0]!.collectedAt },
        now
      ),
      4
    );
  });

  it("includes priority candidates beyond the first 80 created_at rows", () => {
    const now = Date.parse("2026-09-11T12:00:00.000Z");
    const rows: NewsWireDbRow[] = [];
    for (let i = 0; i < 90; i += 1) {
      rows.push(
        dbRow({
          id: `n-${String(i).padStart(3, "0")}`,
          created_at: `2026-09-11T${String(10 - Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00.000Z`,
          ai_recommend_grade: "normal",
          ai_recommend_score: 40,
        })
      );
    }
    rows.push(
      dbRow({
        id: "late-priority",
        created_at: "2026-09-10T13:00:00.000Z",
        ai_recommend_grade: "priority",
        ai_recommend_score: 95,
      })
    );
    const home = selectHomeNewsWireItems(rows, "ko", now);
    assert.ok(home.some((i) => i.id === "late-priority"));
    assert.equal(home[0]?.id, "late-priority");
  });

  it("computes hasMore from filtered candidate total", () => {
    const now = Date.parse("2026-09-11T12:00:00.000Z");
    const rows = Array.from({ length: 51 }, (_, i) =>
      dbRow({
        id: `r-${i}`,
        created_at: `2026-09-11T10:${String(i % 60).padStart(2, "0")}:00.000Z`,
        ai_recommend_grade: "normal",
        ai_recommend_score: 50 - (i % 10),
      })
    );
    const ranked = rankDbRowsToPublicItems(rows, "ko", now);
    assert.equal(ranked.length, 51);
    const page1 = paginateNewsWireItems(ranked, 1);
    assert.equal(page1.items.length, 50);
    assert.equal(page1.hasMore, true);
    const page2 = paginateNewsWireItems(ranked, 2);
    assert.equal(page2.items.length, 1);
    assert.equal(page2.hasMore, false);
  });
});

describe("news wire page + date bounds", () => {
  it("clamps page to a finite positive integer", () => {
    assert.equal(parseNewsWirePage(0), 1);
    assert.equal(parseNewsWirePage(-3), 1);
    assert.equal(parseNewsWirePage("abc"), 1);
    assert.equal(parseNewsWirePage(Number.POSITIVE_INFINITY), 1);
    assert.equal(parseNewsWirePage(1e9), 200);
    assert.equal(parseNewsWirePage("12"), 12);
  });

  it("rejects impossible calendar dates", () => {
    assert.equal(nyDateKeyBounds("2026-99-99"), null);
    assert.equal(nyDateKeyBounds("2026-02-30"), null);
  });

  it("uses next NY day start for DST-safe bounds", () => {
    const spring = nyDateKeyBounds("2026-03-08");
    assert.ok(spring);
    assert.equal(
      Date.parse(spring!.endIso) - Date.parse(spring!.startIso),
      23 * 60 * 60 * 1000
    );
    const fall = nyDateKeyBounds("2026-11-01");
    assert.ok(fall);
    assert.equal(
      Date.parse(fall!.endIso) - Date.parse(fall!.startIso),
      25 * 60 * 60 * 1000
    );
  });
});

describe("news wire public DTO + no OpenAI path", () => {
  it("public items omit AI grade/score and article_id", () => {
    const now = Date.parse("2026-09-11T12:00:00.000Z");
    const items = selectHomeNewsWireItems(
      [
        dbRow({
          id: "x",
          created_at: "2026-09-11T10:00:00.000Z",
          ai_recommend_grade: "best",
          ai_recommend_score: 99,
          article_id: "art-1",
        }),
      ],
      "ko",
      now
    );
    assert.equal(items.length, 1);
    const json = JSON.stringify(items[0]);
    assert.doesNotMatch(json, /ai_recommend|aiRecommend|article_id|articleId/);
    assert.deepEqual(Object.keys(items[0]!).sort(), [
      "collectedAt",
      "id",
      "originalUrl",
      "publishedAt",
      "sourceLabel",
      "title",
    ]);
  });

  it("NewsWireItem whitelist has no translation fields", () => {
    const types = readFileSync(
      join(process.cwd(), "lib/news-wire/types.ts"),
      "utf8"
    );
    const publicBlock = types.slice(
      types.indexOf("export type NewsWireItem"),
      types.indexOf("export type NewsWireLocale")
    );
    assert.doesNotMatch(
      publicBlock,
      /ai_recommend|article_id|wire_titles|rss_title_en|rss_title_ko/
    );
    assert.doesNotMatch(types, /rss_title_en|wire_titles_ready_at/);
  });

  it("HomeNewsView shows NewsWire even when Spotlight is empty", () => {
    const home = readFileSync(
      join(process.cwd(), "components/home/HomeNewsView.tsx"),
      "utf8"
    );
    assert.match(home, /newsWireItems\.length\s*>\s*0/);
    assert.doesNotMatch(home, /showLeftRailContent/);
    const aside = home.slice(home.indexOf("homeLeftRailColClass"));
    assert.ok(aside.indexOf("SpotlightRail") < aside.indexOf("NewsWireRail"));
  });

  it("migration file remains additive (do not edit applied migration)", () => {
    const sql = readFileSync(
      join(process.cwd(), "migrations/20260911_public_news_wire_v1.sql"),
      "utf8"
    );
    assert.match(sql, /rss_title_en/);
    assert.match(sql, /wire_titles_ready_at/);
    assert.match(sql, /IF NOT EXISTS/);
    assert.doesNotMatch(sql, /^\s*DROP\s+/im);
  });

  it("collect and wire paths make zero OpenAI calls; translation modules removed", () => {
    const fetchSrc = readFileSync(
      join(process.cwd(), "lib/news-wire/fetchNewsWire.ts"),
      "utf8"
    );
    const querySrc = readFileSync(
      join(process.cwd(), "lib/news-wire/newsWireQuery.ts"),
      "utf8"
    );
    const collect = readFileSync(
      join(process.cwd(), "lib/rss/collectRssToReviewQueue.ts"),
      "utf8"
    );
    const regional = readFileSync(
      join(process.cwd(), "lib/cron/runRegionalCollect.ts"),
      "utf8"
    );
    const legacy = readFileSync(
      join(process.cwd(), "app/api/cron/collect-news/route.ts"),
      "utf8"
    );
    const ko = readFileSync(join(process.cwd(), "app/ko/wire/page.tsx"), "utf8");
    const en = readFileSync(join(process.cwd(), "app/en/wire/page.tsx"), "utf8");

    assert.doesNotMatch(fetchSrc, /chatCompletion|localizeWire|OpenAI|after\(/);
    assert.doesNotMatch(querySrc, /isWireTitlesReady|displayWireTitle|rss_title_en/);
    assert.match(querySrc, /displayOriginalWireTitle/);
    assert.doesNotMatch(collect, /localizeWire|scheduleWire|after\(/);
    assert.doesNotMatch(regional, /scheduleWire|wireTitleLocalization|after\(/);
    assert.doesNotMatch(legacy, /scheduleWire|wireTitleLocalization|after\(/);
    assert.match(legacy, /openaiCalled:\s*false/);
    assert.match(regional, /openaiCalled:\s*false/);
    assert.doesNotMatch(ko, /localizeWire|chatCompletion|OpenAI/);
    assert.doesNotMatch(en, /localizeWire|chatCompletion|OpenAI/);

    for (const rel of [
      "lib/news-wire/localizeWireTitles.ts",
      "lib/news-wire/localizeWireTitlesLogic.ts",
      "lib/news-wire/runWireLocalizeBatch.ts",
      "lib/news-wire/scheduleWireTitleLocalizeAfter.ts",
      "scripts/newsWireTitleBackfillDryRun.ts",
    ]) {
      assert.throws(() => readFileSync(join(process.cwd(), rel), "utf8"));
    }
  });
});
