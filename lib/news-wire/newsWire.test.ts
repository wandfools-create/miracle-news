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
} from "@/lib/news-wire/rankNewsWire";
import {
  displayWireTitle,
  isWireEnTitleReady,
  isWireKoTitleReady,
  isWireTitlesReady,
  sanitizeWireOutboundUrl,
} from "@/lib/news-wire/wireTitles";
import type { NewsWireItem } from "@/lib/news-wire/types";

function item(
  partial: Partial<NewsWireItem> & Pick<NewsWireItem, "id" | "collectedAt">
): NewsWireItem {
  return {
    title: partial.title ?? "t",
    sourceKey: "ap",
    sourceLabel: "AP",
    publishedAt: partial.publishedAt ?? partial.collectedAt,
    originalUrl: "https://example.com/a",
    aiRecommendGrade: partial.aiRecommendGrade ?? null,
    aiRecommendScore: partial.aiRecommendScore ?? null,
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

  it("displays KO/EN titles from stored fields", () => {
    const row = {
      rss_title: "Seoul summit",
      rss_title_ko: "서울 회담",
      rss_title_en: "Seoul summit talks",
    };
    assert.equal(displayWireTitle(row, "ko"), "서울 회담");
    assert.equal(displayWireTitle(row, "en"), "Seoul summit talks");
  });

  it("sanitizes outbound URLs to http(s) only", () => {
    assert.equal(sanitizeWireOutboundUrl("https://ex.com/a"), "https://ex.com/a");
    assert.equal(sanitizeWireOutboundUrl("javascript:alert(1)"), null);
    assert.equal(sanitizeWireOutboundUrl("ftp://x"), null);
  });
});

describe("news wire ranking", () => {
  it("keeps KO/EN id order identical after sort", () => {
    const now = Date.parse("2026-09-11T12:00:00.000Z");
    const rows = [
      item({
        id: "low-old",
        collectedAt: "2026-09-11T01:00:00.000Z",
        aiRecommendGrade: "low",
        aiRecommendScore: 10,
      }),
      item({
        id: "priority",
        collectedAt: "2026-09-11T02:00:00.000Z",
        aiRecommendGrade: "priority",
        aiRecommendScore: 80,
      }),
      item({
        id: "uneval-recent",
        collectedAt: "2026-09-11T11:30:00.000Z",
        aiRecommendGrade: null,
      }),
      item({
        id: "normal",
        collectedAt: "2026-09-11T03:00:00.000Z",
        aiRecommendGrade: "normal",
        aiRecommendScore: 50,
      }),
      item({
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
    assert.equal(newsWireRankBucket({ aiRecommendGrade: "low", createdAt: rows[0]!.collectedAt }, now), 4);
  });
});

describe("news wire wiring (fixture)", () => {
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

  it("home mounts NewsWire under SpotlightRail without changing selection imports", () => {
    const home = readFileSync(
      join(process.cwd(), "components/home/HomeNewsView.tsx"),
      "utf8"
    );
    assert.match(home, /NewsWireRail/);
    assert.match(home, /newsWireItems/);
    const aside = home.slice(home.indexOf("homeLeftRailColClass"));
    assert.ok(aside.indexOf("SpotlightRail") < aside.indexOf("NewsWireRail"));
    assert.doesNotMatch(home, /prepareEditionHomeSections/);
  });

  it("wire pages and collect hook avoid page-time OpenAI", () => {
    const ko = readFileSync(
      join(process.cwd(), "app/ko/wire/page.tsx"),
      "utf8"
    );
    const en = readFileSync(
      join(process.cwd(), "app/en/wire/page.tsx"),
      "utf8"
    );
    const fetchSrc = readFileSync(
      join(process.cwd(), "lib/news-wire/fetchNewsWire.ts"),
      "utf8"
    );
    const collect = readFileSync(
      join(process.cwd(), "lib/rss/collectRssToReviewQueue.ts"),
      "utf8"
    );
    assert.match(ko, /fetchNewsWireDayPage/);
    assert.match(en, /fetchNewsWireDayPage/);
    assert.doesNotMatch(ko, /localizeWire|chatCompletion|OpenAI/);
    assert.doesNotMatch(en, /localizeWire|chatCompletion|OpenAI/);
    assert.doesNotMatch(fetchSrc, /chatCompletion|localizeWireCandidateTitles/);
    assert.match(collect, /scheduleWireTitleLocalizationAfterCollect/);
    assert.match(fetchSrc, /NEWS_WIRE_INCLUDE_STATUSES|pending/);
    assert.match(fetchSrc, /enrich_failed/);
    assert.doesNotMatch(fetchSrc, /enrich_error/);
  });

  it("public DTO omits admin/error fields", () => {
    const types = readFileSync(
      join(process.cwd(), "lib/news-wire/types.ts"),
      "utf8"
    );
    assert.match(types, /export type NewsWireItem/);
    assert.doesNotMatch(types, /enrich_error|discord|rss_summary/);
  });
});
