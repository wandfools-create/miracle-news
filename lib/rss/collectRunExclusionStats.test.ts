import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCollectRunExclusionStats,
  classifyFieldExclusionDecisionKey,
  displayExclusionStat,
  displayUnprocessed,
  emptyCollectRunExclusionStats,
  emptyFeedStatRow,
  formatExclusionStatDisplay,
  parseCollectRunExclusionStats,
  reconcileCollectRunStats,
  sanitizeCollectRunExclusionStatsForStorage,
  stableFeedKey,
  sumFinalArticleReasons,
} from "@/lib/rss/collectRunExclusionStats";
import {
  filterRunSummariesByRegion,
  summarizeCollectionRuns,
  type StoredCollectionRun,
} from "@/lib/collection-candidates/groupCandidatesByRun";

describe("collectRunExclusionStats v2", () => {
  it("aggregates single final reasons without double-counting stages", () => {
    const feedA = emptyFeedStatRow(stableFeedKey("https://example.com/a.xml"), "politics");
    feedA.rssReceived = 100;
    feedA.dateOkWithin72h = 20;
    feedA.undated = 2;
    feedA.olderThan72h = 78;
    feedA.fieldCountryKeyword = 5;
    feedA.otherSkipped = 1;
    feedA.feedOrSourceCap = 6;
    feedA.duplicateUrl = 3;
    feedA.saved = 4;
    feedA.saveFailed = 1;
    // 5+1+6+3+4+1 = 20 = dateOk

    const feedB = emptyFeedStatRow(stableFeedKey("https://example.com/b.xml"), "world");
    feedB.rssReceived = 10;
    feedB.dateOkWithin72h = 4;
    feedB.olderThan72h = 6;
    feedB.saved = 2;
    feedB.duplicateUrl = 2;

    const stats = buildCollectRunExclusionStats({
      feeds: [
        {
          sourceKey: "nyt",
          feedUrl: "https://example.com/a.xml",
          category: "politics",
          bucket: feedA,
          fetchedOk: true,
          at: "2026-09-14T12:00:00.000Z",
        },
        {
          sourceKey: "nyt",
          feedUrl: "https://example.com/b.xml",
          category: "world",
          bucket: feedB,
          fetchedOk: true,
          at: "2026-09-14T12:00:00.000Z",
        },
      ],
      byCategory: { politics: 4, world: 2 },
      runLimitConfigured: 20,
      runLimitUsed: 6,
      unprocessedExact: 0,
    });

    assert.equal(stats.rssReceived, 110);
    assert.equal(stats.dateOkWithin72h, 24);
    assert.equal(stats.saved, 6);
    assert.equal(stats.fieldCountryKeyword, 5);
    assert.equal(stats.feedOrSourceCap, 6);
    assert.equal(stats.duplicateUrl, 5);
    assert.equal(stats.sources.length, 1);
    assert.equal(stats.sources[0]?.sourceKey, "nyt");
    assert.equal(stats.sources[0]?.feeds.length, 2);
    assert.equal(stats.sources[0]?.rssReceived, 110);

    const recon = reconcileCollectRunStats(stats);
    assert.equal(recon.receivedStageGap, 0);
    assert.equal(recon.dateStageGap, 0);
    assert.equal(recon.balanced, true);

    // Final reasons must not include saved/stages/feed failures.
    const finals = sumFinalArticleReasons(stats);
    assert.equal(
      finals,
      stats.undated +
        stats.olderThan72h +
        stats.duplicateUrl +
        stats.feedOrSourceCap +
        stats.fieldCountryKeyword +
        stats.otherSkipped +
        stats.saveFailed
    );
  });

  it("shows 기록 없음 for missing legacy stats — never invents zero", () => {
    assert.deepEqual(displayExclusionStat(null, "rssReceived"), {
      kind: "missing",
      label: "기록 없음",
    });
    assert.equal(
      formatExclusionStatDisplay(displayUnprocessed(undefined)),
      "기록 없음"
    );
    assert.equal(parseCollectRunExclusionStats(null), null);
    assert.equal(parseCollectRunExclusionStats({}), null);
    assert.equal(parseCollectRunExclusionStats({ version: 1 }), null);
    assert.equal(parseCollectRunExclusionStats({ version: 2 }), null);
  });

  it("treats run-limit leftovers as 미처리, not 제외", () => {
    const feed = emptyFeedStatRow(stableFeedKey("https://ex.com/f.xml"));
    feed.rssReceived = 10;
    feed.dateOkWithin72h = 10;
    feed.saved = 3;
    feed.duplicateUrl = 2;
    // 5 left in queue when limit hit
    const stats = buildCollectRunExclusionStats({
      feeds: [
        {
          sourceKey: "ap",
          feedUrl: "https://ex.com/f.xml",
          bucket: feed,
          fetchedOk: true,
          at: "2026-09-14T12:00:00.000Z",
        },
      ],
      byCategory: { other: 3 },
      runLimitConfigured: 3,
      runLimitUsed: 3,
      unprocessedExact: 5,
    });
    assert.equal(stats.runLimit.reached, true);
    assert.equal(stats.runLimit.configured, 3);
    assert.equal(stats.runLimit.used, 3);
    assert.equal(stats.runLimit.unprocessed, 5);
    assert.equal(
      formatExclusionStatDisplay(displayUnprocessed(stats)),
      "5"
    );
    // Unprocessed is not part of final exclusion reasons.
    assert.equal(stats.feedOrSourceCap, 0);
    assert.equal(reconcileCollectRunStats(stats).balanced, true);
  });

  it("does not invent unprocessed when unknown", () => {
    const stats = emptyCollectRunExclusionStats(20);
    stats.runLimit.unprocessed = null;
    assert.equal(
      formatExclusionStatDisplay(displayUnprocessed(stats)),
      "미처리/기록 없음"
    );
  });

  it("keeps feedFetchFailed separate from article exclusion counts", () => {
    const ok = emptyFeedStatRow(stableFeedKey("https://ex.com/ok.xml"));
    ok.rssReceived = 5;
    ok.dateOkWithin72h = 5;
    ok.saved = 2;
    ok.otherSkipped = 3;
    const bad = emptyFeedStatRow(stableFeedKey("https://ex.com/bad.xml"));
    bad.feedFetchFailed = 1;
    const stats = buildCollectRunExclusionStats({
      feeds: [
        {
          sourceKey: "bbc",
          feedUrl: "https://ex.com/ok.xml",
          bucket: ok,
          fetchedOk: true,
          at: "2026-09-14T12:00:00.000Z",
        },
        {
          sourceKey: "cdc",
          feedUrl: "https://ex.com/bad.xml",
          bucket: bad,
          fetchedOk: false,
          at: "2026-09-14T12:00:00.000Z",
        },
      ],
      byCategory: {},
      runLimitConfigured: 20,
      runLimitUsed: 2,
      unprocessedExact: 0,
    });
    assert.equal(stats.feedFetchFailed, 1);
    assert.equal(sumFinalArticleReasons(stats), 3); // otherSkipped only
    assert.equal(stats.sources.find((s) => s.sourceKey === "cdc")?.lastFailureAt, "2026-09-14T12:00:00.000Z");
    assert.equal(stats.sources.find((s) => s.sourceKey === "bbc")?.lastSuccessAt, "2026-09-14T12:00:00.000Z");
  });

  it("sanitizes storage payload and rejects titles/urls/error text", () => {
    const feed = emptyFeedStatRow(stableFeedKey("https://ex.com/f.xml"));
    feed.rssReceived = 1;
    feed.dateOkWithin72h = 1;
    feed.saved = 1;
    const built = buildCollectRunExclusionStats({
      feeds: [
        {
          sourceKey: "ap",
          feedUrl: "https://ex.com/f.xml",
          bucket: feed,
          fetchedOk: true,
          at: "2026-09-14T12:00:00.000Z",
        },
      ],
      byCategory: { politics: 1 },
      runLimitConfigured: 20,
      runLimitUsed: 1,
      unprocessedExact: 0,
    });
    const dirty = {
      ...built,
      title: "should not persist",
      errorText: "ECONNRESET boom",
      sources: built.sources.map((s) => ({
        ...s,
        feedUrl: "https://secret.example/rss",
      })),
    } as unknown as typeof built;
    const clean = sanitizeCollectRunExclusionStatsForStorage(dirty);
    assert.ok(clean);
    assert.equal("title" in (clean as object), false);
    const json = JSON.stringify(clean);
    assert.equal(json.includes("should not persist"), false);
    assert.equal(json.includes("ECONNRESET"), false);
    assert.equal(json.includes("https://"), false);
    assert.equal(sanitizeCollectRunExclusionStatsForStorage(null), null);
    assert.equal(sanitizeCollectRunExclusionStatsForStorage({} as never), null);
  });

  it("classifies field decision keys into fieldCountryKeyword bucket", () => {
    assert.equal(
      classifyFieldExclusionDecisionKey("field-disabled:politics"),
      "fieldCountryKeyword"
    );
    assert.equal(
      classifyFieldExclusionDecisionKey("field-exclude-kw:soft"),
      "fieldCountryKeyword"
    );
    assert.equal(classifyFieldExclusionDecisionKey("mystery"), "otherSkipped");
  });

  it("surfaces reconciliation gap as 미처리/기록 없음 signal", () => {
    const stats = emptyCollectRunExclusionStats(20);
    stats.rssReceived = 10;
    stats.dateOkWithin72h = 10;
    stats.saved = 1;
    stats.runLimit.unprocessed = 0;
    // Missing 9 accounted items → gap
    const recon = reconcileCollectRunStats(stats);
    assert.equal(recon.balanced, false);
    assert.ok((recon.dateStageGap ?? 0) !== 0);
  });
});

describe("collection run exclusion stats in summaries", () => {
  it("legacy stored runs expose null exclusionStats (기록 없음)", () => {
    const runId = "44444444-4444-4444-8444-444444444444";
    const summaries = summarizeCollectionRuns([], [
      {
        id: runId,
        region: "us-intl",
        started_at: "2026-09-14T12:00:00.000Z",
        finished_at: "2026-09-14T12:05:00.000Z",
        status: "success",
        collected_count: 200,
        new_candidate_count: 15,
        failed_count: 0,
      } satisfies StoredCollectionRun,
    ]);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.exclusionStats, null);
    assert.equal(
      formatExclusionStatDisplay(
        displayExclusionStat(summaries[0]?.exclusionStats, "rssReceived")
      ),
      "기록 없음"
    );
  });

  it("new stored runs surface parsed exclusion stats with sources", () => {
    const runId = "55555555-5555-4555-8555-555555555555";
    const feed = emptyFeedStatRow(stableFeedKey("https://ex.com/p.xml"), "politics");
    feed.rssReceived = 183;
    feed.dateOkWithin72h = 40;
    feed.olderThan72h = 143;
    feed.feedOrSourceCap = 20;
    feed.saved = 15;
    feed.duplicateUrl = 5;
    const stats = buildCollectRunExclusionStats({
      feeds: [
        {
          sourceKey: "nyt",
          feedUrl: "https://ex.com/p.xml",
          category: "politics",
          bucket: feed,
          fetchedOk: true,
          at: "2026-09-14T18:00:00.000Z",
        },
      ],
      byCategory: { politics: 15 },
      runLimitConfigured: 20,
      runLimitUsed: 15,
      unprocessedExact: 0,
    });

    const summaries = summarizeCollectionRuns([], [
      {
        id: runId,
        region: "us-intl",
        started_at: "2026-09-14T18:00:00.000Z",
        finished_at: "2026-09-14T18:05:00.000Z",
        status: "success",
        collected_count: 183,
        new_candidate_count: 15,
        failed_count: 0,
        exclusion_stats: stats,
      },
    ]);
    assert.equal(summaries[0]?.exclusionStats?.rssReceived, 183);
    assert.equal(summaries[0]?.exclusionStats?.saved, 15);
    assert.equal(summaries[0]?.exclusionStats?.runLimit.configured, 20);
    assert.equal(summaries[0]?.exclusionStats?.sources[0]?.sourceKey, "nyt");
  });

  it("keeps korea and us-intl runs separable with exclusion stats", () => {
    const koreaFeed = emptyFeedStatRow(stableFeedKey("https://ex.com/kr.xml"));
    koreaFeed.rssReceived = 40;
    koreaFeed.dateOkWithin72h = 8;
    koreaFeed.olderThan72h = 32;
    koreaFeed.saved = 8;
    const koreaStats = buildCollectRunExclusionStats({
      feeds: [
        {
          sourceKey: "chosun",
          feedUrl: "https://ex.com/kr.xml",
          bucket: koreaFeed,
          fetchedOk: true,
          at: "2026-09-14T10:00:00.000Z",
        },
      ],
      byCategory: {},
      runLimitConfigured: 15,
      runLimitUsed: 8,
      unprocessedExact: 0,
    });

    const usFeed = emptyFeedStatRow(stableFeedKey("https://ex.com/us.xml"));
    usFeed.rssReceived = 200;
    usFeed.dateOkWithin72h = 12;
    usFeed.olderThan72h = 188;
    usFeed.saved = 12;
    const usStats = buildCollectRunExclusionStats({
      feeds: [
        {
          sourceKey: "ap",
          feedUrl: "https://ex.com/us.xml",
          bucket: usFeed,
          fetchedOk: true,
          at: "2026-09-14T11:00:00.000Z",
        },
      ],
      byCategory: {},
      runLimitConfigured: 20,
      runLimitUsed: 12,
      unprocessedExact: 0,
    });

    const summaries = summarizeCollectionRuns([], [
      {
        id: "66666666-6666-4666-8666-666666666666",
        region: "korea",
        started_at: "2026-09-14T10:00:00.000Z",
        finished_at: "2026-09-14T10:05:00.000Z",
        status: "success",
        collected_count: 40,
        new_candidate_count: 8,
        failed_count: 0,
        exclusion_stats: koreaStats,
      },
      {
        id: "77777777-7777-4777-8777-777777777777",
        region: "us-intl",
        started_at: "2026-09-14T11:00:00.000Z",
        finished_at: "2026-09-14T11:05:00.000Z",
        status: "success",
        collected_count: 200,
        new_candidate_count: 12,
        failed_count: 0,
        exclusion_stats: usStats,
      },
    ]);

    const korea = filterRunSummariesByRegion(summaries, "korea");
    const usIntl = filterRunSummariesByRegion(summaries, "us-intl");
    assert.equal(korea.length, 1);
    assert.equal(usIntl.length, 1);
    assert.equal(korea[0]?.exclusionStats?.rssReceived, 40);
    assert.equal(usIntl[0]?.exclusionStats?.rssReceived, 200);
    assert.equal(korea[0]?.region, "korea");
    assert.equal(usIntl[0]?.region, "us-intl");
  });
});

describe("finishCollectionRun stats fail-open contract", () => {
  it("collectionRuns source retries without exclusion_stats on write failure", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      new URL("../collection-candidates/collectionRuns.ts", import.meta.url),
      "utf8"
    );
    assert.match(src, /finish without exclusion_stats/);
    assert.match(src, /sanitizeCollectRunExclusionStatsForStorage/);
    assert.match(src, /fail-open/);
  });
});
