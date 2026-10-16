/**
 * Public News Wire — fixture tests only (no DB / OpenAI / RSS).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  compareArchiveNewsWireItems,
  compareNewsWireItems,
  newsWireRankBucket,
  type NewsWireSortable,
} from "@/lib/news-wire/rankNewsWire";
import {
  archiveDbRowsToPublicItems,
  buildHannoonArticleHref,
  isPublicHannoonArticle,
  newsWireIdOrder,
  nyDateKeyBounds,
  paginateNewsWireItems,
  parseNewsWirePage,
  rankDbRowsToPublicItems,
  selectHomeNewsWireItems,
} from "@/lib/news-wire/newsWireQuery";
import type { NewsWireDbRow } from "@/lib/news-wire/types";
import {
  NEWS_WIRE_ARCHIVE_INCLUDE_STATUSES,
  NEWS_WIRE_HOME_LIMIT,
  NEWS_WIRE_HOME_LOOKBACK_MS,
  NEWS_WIRE_INCLUDE_STATUSES,
  NEWS_WIRE_PAGE_SIZE,
} from "@/lib/news-wire/types";
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
      "hannoonHref",
      "id",
      "originalUrl",
      "publishedAt",
      "sourceLabel",
      "title",
    ]);
    assert.equal(items[0]!.hannoonHref, null);
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

describe("news wire permanent archive + Hannoon mark", () => {
  it("keeps enriched candidates in the archive public list", () => {
    const rows = [
      dbRow({
        id: "enriched-1",
        created_at: "2026-09-11T10:00:00.000Z",
        status: "enriched",
        article_id: "art-1",
        rss_title: "Already articleized",
      }),
      dbRow({
        id: "pending-1",
        created_at: "2026-09-11T11:00:00.000Z",
        status: "pending",
        rss_title: "Still pending",
      }),
    ];
    assert.ok(NEWS_WIRE_ARCHIVE_INCLUDE_STATUSES.includes("enriched"));
    assert.ok(NEWS_WIRE_ARCHIVE_INCLUDE_STATUSES.includes("expired"));
    assert.ok(!NEWS_WIRE_INCLUDE_STATUSES.includes("enriched"));
    const items = archiveDbRowsToPublicItems(rows, "ko");
    assert.deepEqual(
      items.map((i) => i.id).sort(),
      ["enriched-1", "pending-1"]
    );
  });

  it("shows candidates with no article link", () => {
    const items = archiveDbRowsToPublicItems(
      [
        dbRow({
          id: "orphan",
          created_at: "2026-09-11T10:00:00.000Z",
          article_id: null,
          status: "pending",
        }),
      ],
      "en"
    );
    assert.equal(items.length, 1);
    assert.equal(items[0]!.hannoonHref, null);
  });

  it("shows Hannoon mark only for truly public linked articles", () => {
    const hrefMap = new Map([["art-live", "/ko/article/live-slug"]]);
    const items = archiveDbRowsToPublicItems(
      [
        dbRow({
          id: "with-public",
          created_at: "2026-09-11T10:00:00.000Z",
          status: "enriched",
          article_id: "art-live",
        }),
        dbRow({
          id: "with-draft",
          created_at: "2026-09-11T09:00:00.000Z",
          status: "enriched",
          article_id: "art-draft",
        }),
        dbRow({
          id: "enriching",
          created_at: "2026-09-11T08:00:00.000Z",
          status: "enriching",
          article_id: null,
        }),
        dbRow({
          id: "failed",
          created_at: "2026-09-11T07:00:00.000Z",
          status: "enrich_failed",
          article_id: "art-partial",
        }),
      ],
      "ko",
      hrefMap
    );
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    assert.equal(byId["with-public"]!.hannoonHref, "/ko/article/live-slug");
    assert.equal(byId["with-draft"]!.hannoonHref, null);
    assert.equal(byId["enriching"]!.hannoonHref, null);
    assert.equal(byId["failed"]!.hannoonHref, null);
  });

  it("public article gate rejects unpublished / in-progress / revoked", () => {
    assert.equal(
      isPublicHannoonArticle({
        is_published: true,
        status: "published",
        review_status: "approved",
        published_at: "2026-09-11T12:00:00.000Z",
      }),
      true
    );
    assert.equal(
      isPublicHannoonArticle({
        is_published: false,
        status: "approved",
        review_status: "approved",
        published_at: null,
      }),
      false
    );
    assert.equal(
      isPublicHannoonArticle({
        is_published: true,
        status: "ready_for_human_review",
        review_status: "pending",
        published_at: null,
      }),
      false
    );
    assert.equal(
      isPublicHannoonArticle({
        is_published: false,
        status: "published",
        review_status: "approved",
        published_at: "2026-09-11T12:00:00.000Z",
      }),
      false
    );
    assert.equal(buildHannoonArticleHref("ko", "abc"), "/ko/article/abc");
    assert.equal(buildHannoonArticleHref("en", "abc"), "/en/article/abc");
    assert.equal(buildHannoonArticleHref("ko", "  "), null);
  });

  it("excludes dismissed and dangerous URLs from public archive", () => {
    assert.ok(!NEWS_WIRE_ARCHIVE_INCLUDE_STATUSES.includes("dismissed"));
    const items = archiveDbRowsToPublicItems(
      [
        dbRow({
          id: "danger",
          created_at: "2026-09-11T10:00:00.000Z",
          status: "pending",
          original_url: "javascript:alert(1)",
          rss_title: "Bad",
        }),
        dbRow({
          id: "ftp",
          created_at: "2026-09-11T09:00:00.000Z",
          status: "pending",
          original_url: "ftp://evil.example/x",
        }),
        dbRow({
          id: "ok",
          created_at: "2026-09-11T08:00:00.000Z",
          status: "pending",
          original_url: "https://safe.example/a",
        }),
      ],
      "ko"
    );
    assert.deepEqual(
      items.map((i) => i.id),
      ["ok"]
    );
    assert.ok(items[0]!.originalUrl.startsWith("https://"));
  });

  it("original links use target=_blank noopener noreferrer in page view", () => {
    const view = readFileSync(
      join(process.cwd(), "components/news-wire/NewsWirePageView.tsx"),
      "utf8"
    );
    assert.match(view, /target="_blank"/);
    assert.match(view, /rel="noopener noreferrer"/);
    assert.match(view, /한눈 기사/);
    assert.match(view, /Hannoon/);
    assert.match(view, /item\.hannoonHref/);
  });

  it("KO/EN archive share the same candidate id order", () => {
    const rows = [
      dbRow({
        id: "a",
        created_at: "2026-09-11T10:00:00.000Z",
        rss_published_at: "2026-09-11T09:00:00.000Z",
      }),
      dbRow({
        id: "b",
        created_at: "2026-09-11T11:00:00.000Z",
        rss_published_at: null,
      }),
      dbRow({
        id: "c",
        created_at: "2026-09-11T12:00:00.000Z",
        rss_published_at: "2026-09-11T08:00:00.000Z",
      }),
    ];
    const ko = archiveDbRowsToPublicItems(rows, "ko");
    const en = archiveDbRowsToPublicItems(rows, "en");
    assert.deepEqual(newsWireIdOrder(ko), newsWireIdOrder(en));
  });

  it("archive sort is rss_published_at DESC NULLS LAST, then created_at DESC, id ASC", () => {
    const sorted = [
      {
        id: "older-pub",
        publishedAt: "2026-09-10T12:00:00.000Z",
        collectedAt: "2026-09-11T20:00:00.000Z",
      },
      {
        id: "newer-pub",
        publishedAt: "2026-09-11T12:00:00.000Z",
        collectedAt: "2026-09-11T01:00:00.000Z",
      },
      {
        id: "null-b",
        publishedAt: null,
        collectedAt: "2026-09-11T10:00:00.000Z",
      },
      {
        id: "null-a",
        publishedAt: null,
        collectedAt: "2026-09-11T10:00:00.000Z",
      },
    ].sort(compareArchiveNewsWireItems);
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["newer-pub", "older-pub", "null-a", "null-b"]
    );
  });

  it("paginates archive at max 50 per page", () => {
    assert.equal(NEWS_WIRE_PAGE_SIZE, 50);
    const rows = Array.from({ length: 51 }, (_, i) =>
      dbRow({
        id: `p-${String(i).padStart(3, "0")}`,
        created_at: `2026-09-11T10:00:${String(i % 60).padStart(2, "0")}.000Z`,
        rss_published_at: `2026-09-11T09:${String(i % 60).padStart(2, "0")}:00.000Z`,
        status: "enriched",
      })
    );
    const ranked = archiveDbRowsToPublicItems(rows, "ko");
    const page1 = paginateNewsWireItems(ranked, 1);
    assert.equal(page1.items.length, 50);
    assert.equal(page1.hasMore, true);
    const page2 = paginateNewsWireItems(ranked, 2);
    assert.equal(page2.items.length, 1);
  });

  it("past NY date archive bounds remain queryable", () => {
    const past = nyDateKeyBounds("2025-01-15");
    assert.ok(past);
    assert.ok(Date.parse(past!.startIso) < Date.parse(past!.endIso));
    assert.equal(
      Date.parse(past!.endIso) - Date.parse(past!.startIso),
      24 * 60 * 60 * 1000
    );
  });

  it("public archive DTO whitelist excludes internal fields", () => {
    const items = archiveDbRowsToPublicItems(
      [
        dbRow({
          id: "w",
          created_at: "2026-09-11T10:00:00.000Z",
          status: "enriched",
          article_id: "secret-art",
          ai_recommend_grade: "best",
          ai_recommend_score: 99,
        }),
      ],
      "ko",
      new Map([["secret-art", "/ko/article/public-slug"]])
    );
    const json = JSON.stringify(items[0]);
    assert.doesNotMatch(
      json,
      /ai_recommend|aiRecommend|article_id|articleId|enrich_error|discord|service.?role/i
    );
    assert.deepEqual(Object.keys(items[0]!).sort(), [
      "collectedAt",
      "hannoonHref",
      "id",
      "originalUrl",
      "publishedAt",
      "sourceLabel",
      "title",
    ]);
    assert.equal(items[0]!.hannoonHref, "/ko/article/public-slug");
  });

  it("archive fetch path has no OpenAI and home limits stay unchanged", () => {
    const fetchSrc = readFileSync(
      join(process.cwd(), "lib/news-wire/fetchNewsWire.ts"),
      "utf8"
    );
    assert.doesNotMatch(fetchSrc, /chatCompletion|OpenAI|openai/);
    assert.match(fetchSrc, /NEWS_WIRE_ARCHIVE_INCLUDE_STATUSES/);
    assert.match(fetchSrc, /filterDuplicateLiveArticles/);
    assert.match(
      fetchSrc,
      /Archive keeps articleized rows; do not filterDuplicateLiveArticles/
    );
    assert.equal(NEWS_WIRE_HOME_LIMIT, 8);
    assert.equal(NEWS_WIRE_HOME_LOOKBACK_MS, 24 * 60 * 60 * 1000);
  });

  it("admin 기사 만들기 still calls enrichCandidateAction only", () => {
    const form = readFileSync(
      join(process.cwd(), "components/admin/EnrichCandidateForm.tsx"),
      "utf8"
    );
    assert.match(form, /enrichCandidateAction/);
    assert.doesNotMatch(form, /publishArticle|approvedPublish|quickPublish/);
    const promote = readFileSync(
      join(
        process.cwd(),
        "lib/collection-candidates/promoteCollectionCandidate.ts"
      ),
      "utf8"
    );
    assert.match(promote, /article_id: inserted\.articleId/);
    assert.match(promote, /status: "enriched"/);
  });

  it("home layout and home selection files are unchanged in this PR", () => {
    const home = readFileSync(
      join(process.cwd(), "components/home/HomeNewsView.tsx"),
      "utf8"
    );
    assert.match(home, /NewsWireRail/);
    assert.match(home, /homeLeftRailColClass/);
    const fetchHome = readFileSync(
      join(process.cwd(), "lib/news-wire/fetchNewsWire.ts"),
      "utf8"
    );
    assert.match(fetchHome, /filterDuplicateLiveArticles\(client, fetched\.rows\)/);
    assert.match(fetchHome, /NEWS_WIRE_INCLUDE_STATUSES/);
  });
});
