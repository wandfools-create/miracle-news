import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCollectRunExclusionStats,
  classifyFieldExclusionDecisionKey,
  displayExclusionStat,
  emptyCollectRunExclusionStats,
  formatExclusionStatDisplay,
  parseCollectRunExclusionStats,
} from "@/lib/rss/collectRunExclusionStats";
import {
  filterRunSummariesByRegion,
  summarizeCollectionRuns,
  type StoredCollectionRun,
} from "@/lib/collection-candidates/groupCandidatesByRun";

describe("collectRunExclusionStats", () => {
  it("aggregates reason counts and byCategory without inventing fields", () => {
    const a = emptyCollectRunExclusionStats();
    const b = addCollectRunExclusionStats(a, {
      rssReceived: 100,
      saved: 4,
      undated: 2,
      olderThan72h: 80,
      feedCapReached: 10,
      duplicateUrl: 3,
      fieldDisabled: 1,
      excludeKeyword: 2,
      byCategory: { politics: 3, world: 1 },
    });
    const c = addCollectRunExclusionStats(b, {
      rssReceived: 50,
      saved: 2,
      olderThan72h: 40,
      byCategory: { politics: 1, society: 1 },
    });

    assert.equal(c.rssReceived, 150);
    assert.equal(c.saved, 6);
    assert.equal(c.undated, 2);
    assert.equal(c.olderThan72h, 120);
    assert.equal(c.feedCapReached, 10);
    assert.equal(c.duplicateUrl, 3);
    assert.equal(c.fieldDisabled, 1);
    assert.equal(c.excludeKeyword, 2);
    assert.deepEqual(c.byCategory, { politics: 4, world: 1, society: 1 });
  });

  it("shows 기록 없음 for missing legacy stats — never invents zero", () => {
    assert.deepEqual(displayExclusionStat(null, "rssReceived"), {
      kind: "missing",
      label: "기록 없음",
    });
    assert.equal(
      formatExclusionStatDisplay(displayExclusionStat(undefined, "saved")),
      "기록 없음"
    );
    assert.equal(parseCollectRunExclusionStats(null), null);
    assert.equal(parseCollectRunExclusionStats(undefined), null);
    assert.equal(parseCollectRunExclusionStats({}), null);
    assert.equal(parseCollectRunExclusionStats({ version: 2 }), null);
  });

  it("parses valid v1 stats and rejects incomplete payloads", () => {
    const valid = emptyCollectRunExclusionStats();
    valid.rssReceived = 12;
    valid.saved = 3;
    valid.olderThan72h = 5;
    valid.byCategory = { politics: 2 };
    const parsed = parseCollectRunExclusionStats(valid);
    assert.ok(parsed);
    assert.equal(parsed!.rssReceived, 12);
    assert.equal(parsed!.saved, 3);
    assert.deepEqual(parsed!.byCategory, { politics: 2 });

    const incomplete = { ...valid } as Record<string, unknown>;
    delete incomplete.undated;
    assert.equal(parseCollectRunExclusionStats(incomplete), null);
  });

  it("classifies field decision keys into admin buckets", () => {
    assert.equal(
      classifyFieldExclusionDecisionKey("field-disabled:politics"),
      "fieldDisabled"
    );
    assert.equal(
      classifyFieldExclusionDecisionKey("unclassified-reject"),
      "fieldDisabled"
    );
    assert.equal(
      classifyFieldExclusionDecisionKey("field-exclude-kw:soft"),
      "excludeKeyword"
    );
    assert.equal(
      classifyFieldExclusionDecisionKey("country-exclude:xx"),
      "excludeKeyword"
    );
    assert.equal(classifyFieldExclusionDecisionKey("mystery"), "otherSkipped");
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

  it("new stored runs surface parsed exclusion stats", () => {
    const runId = "55555555-5555-4555-8555-555555555555";
    const stats = emptyCollectRunExclusionStats();
    stats.rssReceived = 183;
    stats.saved = 15;
    stats.olderThan72h = 140;
    stats.feedCapReached = 20;
    stats.byCategory = { politics: 10, world: 5 };

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
    assert.equal(summaries[0]?.exclusionStats?.byCategory.politics, 10);
  });

  it("keeps korea and us-intl runs separable with exclusion stats", () => {
    const koreaStats = emptyCollectRunExclusionStats();
    koreaStats.rssReceived = 40;
    koreaStats.saved = 8;
    const usStats = emptyCollectRunExclusionStats();
    usStats.rssReceived = 200;
    usStats.saved = 12;

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
