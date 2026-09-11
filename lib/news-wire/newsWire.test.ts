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
  displayWireTitle,
  isWireEnTitleReady,
  isWireKoTitleReady,
  isWireTitlesReady,
  sanitizeWireOutboundUrl,
} from "@/lib/news-wire/wireTitles";

function dbRow(
  partial: Partial<NewsWireDbRow> & Pick<NewsWireDbRow, "id" | "created_at">
): NewsWireDbRow {
  return {
    source: partial.source ?? "ap",
    feed_label: partial.feed_label ?? "AP",
    original_url: partial.original_url ?? `https://example.com/${partial.id}`,
    rss_title: partial.rss_title ?? "English headline",
    rss_title_ko: partial.rss_title_ko ?? "한글 제목",
    rss_title_en: partial.rss_title_en ?? "English headline",
    rss_published_at: partial.rss_published_at ?? partial.created_at,
    status: partial.status ?? "pending",
    article_id: partial.article_id ?? null,
    ai_recommend_grade: partial.ai_recommend_grade ?? null,
    ai_recommend_score: partial.ai_recommend_score ?? null,
    wire_titles_ready_at: partial.wire_titles_ready_at ?? null,
    ...partial,
  };
}

function sortKey(
  partial: Partial<NewsWireSortable> & Pick<NewsWireSortable, "id" | "collectedAt">
): NewsWireSortable {
  return {
    aiRecommendGrade: partial.aiRecommendGrade ?? null,
    aiRecommendScore: partial.aiRecommendScore ?? null,
    publishedAt: partial.publishedAt ?? partial.collectedAt,
    ...partial,
  };
}

describe("news wire titles", () => {
  it("treats Hangul rss_title as KO-ready and Latin as EN-ready", () => {
    assert.equal(
      isWireKoTitleReady({ rss_title: "서울에서 회담", rss_title_ko: null }),
      true
    );
    assert.equal(
      isWireEnTitleReady({ rss_title: "Seoul summit", rss_title_en: null }),
      true
    );
    assert.equal(
      isWireTitlesReady({
        rss_title: "Seoul summit",
        rss_title_ko: null,
        rss_title_en: null,
      }),
      false
    );
    assert.equal(
      isWireTitlesReady({
        rss_title: "Seoul summit",
        rss_title_ko: "서울 회담",
        rss_title_en: null,
      }),
      true
    );
  });

  it("does not treat wire_titles_ready_at alone as ready", () => {
    assert.equal(
      isWireTitlesReady({
        rss_title: "Seoul summit",
        rss_title_ko: null,
        rss_title_en: null,
        wire_titles_ready_at: "2026-09-11T00:00:00.000Z",
      }),
      false
    );
  });

  it("never falls back to the opposite language", () => {
    const enOnly = {
      rss_title: "Seoul summit",
      rss_title_ko: null,
      rss_title_en: null,
    };
    assert.equal(displayWireTitle(enOnly, "ko"), null);
    const koOnly = {
      rss_title: "서울 회담",
      rss_title_ko: null,
      rss_title_en: null,
    };
    assert.equal(displayWireTitle(koOnly, "en"), null);
  });

  it("hides wrong-language exposure when ready timestamp is stale", () => {
    const row = dbRow({
      id: "stale",
      created_at: "2026-09-11T10:00:00.000Z",
      rss_title: "English only",
      rss_title_ko: null,
      rss_title_en: null,
      wire_titles_ready_at: "2026-09-11T10:00:00.000Z",
    });
    const now = Date.parse("2026-09-11T12:00:00.000Z");
    assert.deepEqual(selectHomeNewsWireItems([row], "ko", now), []);
    assert.deepEqual(selectHomeNewsWireItems([row], "en", now), []);
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

  it("does not drop ready candidates buried after unreadies", () => {
    const now = Date.parse("2026-09-11T12:00:00.000Z");
    const rows: NewsWireDbRow[] = [];
    for (let i = 0; i < 60; i += 1) {
      rows.push(
        dbRow({
          id: `unready-${i}`,
          created_at: `2026-09-11T11:${String(i).padStart(2, "0")}:00.000Z`,
          rss_title: "English only",
          rss_title_ko: null,
          rss_title_en: null,
          ai_recommend_grade: "best",
          ai_recommend_score: 99,
        })
      );
    }
    rows.push(
      dbRow({
        id: "ready-deep",
        created_at: "2026-09-11T01:00:00.000Z",
        ai_recommend_grade: "normal",
        ai_recommend_score: 50,
      })
    );
    const ranked = rankDbRowsToPublicItems(rows, "ko", now);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.id, "ready-deep");
    const page1 = paginateNewsWireItems(ranked, 1);
    assert.equal(page1.items[0]?.id, "ready-deep");
    assert.equal(page1.hasMore, false);
  });

  it("keeps low and unevaluated candidates on the full page", () => {
    const now = Date.parse("2026-09-11T12:00:00.000Z");
    const rows = [
      dbRow({
        id: "low",
        created_at: "2026-09-11T10:00:00.000Z",
        ai_recommend_grade: "low",
        ai_recommend_score: 5,
      }),
      dbRow({
        id: "uneval",
        created_at: "2026-09-11T09:00:00.000Z",
        ai_recommend_grade: null,
      }),
    ];
    const ranked = rankDbRowsToPublicItems(rows, "en", now);
    assert.deepEqual(
      ranked.map((r) => r.id).sort(),
      ["low", "uneval"]
    );
  });

  it("computes hasMore from filtered ready total", () => {
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
    assert.equal(page1.totalReady, 51);
    const page2 = paginateNewsWireItems(ranked, 2);
    assert.equal(page2.items.length, 1);
    assert.equal(page2.hasMore, false);
  });

  it("preserves identical KO/EN id order", () => {
    const now = Date.parse("2026-09-11T12:00:00.000Z");
    const rows = [
      dbRow({
        id: "a",
        created_at: "2026-09-11T10:00:00.000Z",
        ai_recommend_grade: "priority",
        ai_recommend_score: 80,
        rss_title_ko: "가",
        rss_title_en: "A",
      }),
      dbRow({
        id: "b",
        created_at: "2026-09-11T11:00:00.000Z",
        ai_recommend_grade: "normal",
        ai_recommend_score: 40,
        rss_title_ko: "나",
        rss_title_en: "B",
      }),
    ];
    const ko = newsWireIdOrder(rankDbRowsToPublicItems(rows, "ko", now));
    const en = newsWireIdOrder(rankDbRowsToPublicItems(rows, "en", now));
    assert.deepEqual(ko, en);
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
    assert.equal(nyDateKeyBounds("not-a-date"), null);
  });

  it("uses next NY day start for DST-safe bounds", () => {
    const spring = nyDateKeyBounds("2026-03-08");
    assert.ok(spring);
    const springMs =
      Date.parse(spring!.endIso) - Date.parse(spring!.startIso);
    assert.equal(springMs, 23 * 60 * 60 * 1000);

    const fall = nyDateKeyBounds("2026-11-01");
    assert.ok(fall);
    const fallMs = Date.parse(fall!.endIso) - Date.parse(fall!.startIso);
    assert.equal(fallMs, 25 * 60 * 60 * 1000);

    const normal = nyDateKeyBounds("2026-09-11");
    assert.ok(normal);
    assert.equal(
      Date.parse(normal!.endIso) - Date.parse(normal!.startIso),
      24 * 60 * 60 * 1000
    );
  });
});

describe("news wire public DTO + wiring", () => {
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

  it("NewsWireItem type whitelist has no internal score fields", () => {
    const types = readFileSync(
      join(process.cwd(), "lib/news-wire/types.ts"),
      "utf8"
    );
    const publicBlock = types.slice(
      types.indexOf("export type NewsWireItem"),
      types.indexOf("export type NewsWireLocale")
    );
    assert.doesNotMatch(publicBlock, /ai_recommend|article_id|wire_titles_ready/);
    assert.match(publicBlock, /sourceLabel/);
    assert.match(publicBlock, /originalUrl/);
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
    assert.doesNotMatch(home, /prepareEditionHomeSections/);
  });

  it("migration is additive and does not loosen RLS", () => {
    const sql = readFileSync(
      join(process.cwd(), "migrations/20260911_public_news_wire_v1.sql"),
      "utf8"
    );
    assert.match(sql, /rss_title_en/);
    assert.match(sql, /wire_titles_ready_at/);
    assert.match(sql, /IF NOT EXISTS/);
    assert.doesNotMatch(sql, /^\s*UPDATE\s+/im);
    assert.doesNotMatch(sql, /^\s*DELETE\s+FROM/im);
    assert.doesNotMatch(sql, /^\s*TRUNCATE/im);
    assert.doesNotMatch(sql, /GRANT SELECT[\s\S]*TO anon/i);
  });

  it("fetch uses range pagination; collect awaits one localize batch", () => {
    const fetchSrc = readFileSync(
      join(process.cwd(), "lib/news-wire/fetchNewsWire.ts"),
      "utf8"
    );
    const collect = readFileSync(
      join(process.cwd(), "lib/rss/collectRssToReviewQueue.ts"),
      "utf8"
    );
    const localize = readFileSync(
      join(process.cwd(), "lib/news-wire/localizeWireTitles.ts"),
      "utf8"
    );
    const ko = readFileSync(join(process.cwd(), "app/ko/wire/page.tsx"), "utf8");
    const en = readFileSync(join(process.cwd(), "app/en/wire/page.tsx"), "utf8");
    assert.match(fetchSrc, /collectRowsByRangePagination/);
    assert.doesNotMatch(fetchSrc, /\.limit\(\s*80\s*\)/);
    assert.doesNotMatch(fetchSrc, /\.limit\(\s*51\s*\)/);
    assert.doesNotMatch(fetchSrc, /chatCompletion|localizeWireCandidateTitles/);
    assert.match(collect, /await localizeWireCandidateTitles\(\{\s*limit:\s*40/);
    assert.doesNotMatch(collect, /scheduleWireTitleLocalizationAfterCollect/);
    assert.doesNotMatch(localize, /scheduleWireTitleLocalizationAfterCollect/);
    assert.doesNotMatch(ko, /localizeWire|chatCompletion|OpenAI/);
    assert.doesNotMatch(en, /localizeWire|chatCompletion|OpenAI/);
    assert.match(ko, /parseNewsWirePage/);
    assert.match(en, /parseNewsWirePage/);
  });

  it("dry-run script uses range pagination and safe env loader", () => {
    const script = readFileSync(
      join(process.cwd(), "scripts/newsWireTitleBackfillDryRun.ts"),
      "utf8"
    );
    assert.match(script, /collectRowsByRangePagination/);
    assert.match(script, /loadEnvConfig/);
    assert.match(script, /createClient/);
    assert.doesNotMatch(script, /readFileSync\([^\n]*\.env\.local/);
    assert.doesNotMatch(script, /chatCompletion|OPENAI_API_KEY/);
    assert.match(script, /scannedMatchesCountExact/);
  });

  it("left rail keeps min-w-0 to avoid overflow nesting", () => {
    const home = readFileSync(
      join(process.cwd(), "components/home/HomeNewsView.tsx"),
      "utf8"
    );
    const rail = readFileSync(
      join(process.cwd(), "components/home/NewsWireRail.tsx"),
      "utf8"
    );
    assert.match(home, /homeLeftRailColClass\(\)/);
    assert.match(home, /order-3 min-w-0 xl:order-none xl:row-start-2/);
    assert.match(rail, /min-w-0/);
    assert.match(rail, /line-clamp-2/);
    assert.match(rail, /truncate/);
  });
});
