import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AI_RECOMMEND_MAX_BATCH,
  buildAiRecommendUserPayload,
  compareCandidatesByAiRecommend,
  isCandidateWithinLookback,
  normalizeAiRecommendGrade,
  normalizeAiRecommendScore,
  parseAiRecommendResponseItems,
} from "./candidateRecommend";
import { parseCandidateListQuery } from "./candidateListQuery";

describe("candidateRecommend (fixture only, no OpenAI)", () => {
  it("normalizes grades and scores", () => {
    assert.equal(normalizeAiRecommendGrade("BEST"), "best");
    assert.equal(normalizeAiRecommendGrade("우선 검토"), "priority");
    assert.equal(normalizeAiRecommendGrade("nope"), null);
    assert.equal(normalizeAiRecommendScore(87.4), 87);
    assert.equal(normalizeAiRecommendScore(140), 100);
    assert.equal(normalizeAiRecommendScore(-3), 0);
  });

  it("parses OpenAI-shaped JSON items", () => {
    const items = parseAiRecommendResponseItems([
      {
        id: "a",
        grade: "best",
        score: 92,
        reason: "국제 파급력이 큰 특종성 이슈",
      },
      { id: "b", grade: "priority", score: 78, reason: "시의성 높은 정치 뉴스" },
      { id: "bad", grade: "weird", score: 50, reason: "x" },
    ]);
    assert.equal(items.length, 2);
    assert.equal(items[0]?.grade, "best");
    assert.equal(items[1]?.score, 78);
  });

  it("sorts BEST → priority → newest", () => {
    const rows = [
      {
        aiRecommendGrade: "normal" as const,
        rssPublishedAt: "2026-08-23T12:00:00.000Z",
      },
      {
        aiRecommendGrade: "best" as const,
        rssPublishedAt: "2026-08-22T12:00:00.000Z",
      },
      {
        aiRecommendGrade: "priority" as const,
        rssPublishedAt: "2026-08-23T18:00:00.000Z",
      },
      {
        aiRecommendGrade: "priority" as const,
        rssPublishedAt: "2026-08-23T10:00:00.000Z",
      },
      {
        aiRecommendGrade: null,
        rssPublishedAt: "2026-08-23T20:00:00.000Z",
      },
    ];
    const sorted = [...rows].sort(compareCandidatesByAiRecommend);
    assert.equal(sorted[0]?.aiRecommendGrade, "best");
    assert.equal(sorted[1]?.aiRecommendGrade, "priority");
    assert.equal(sorted[1]?.rssPublishedAt, "2026-08-23T18:00:00.000Z");
    assert.equal(sorted[2]?.aiRecommendGrade, "priority");
    assert.equal(sorted[3]?.aiRecommendGrade, "normal");
    assert.equal(sorted[4]?.aiRecommendGrade, null);
  });

  it("defaults view to ai and caps batch at 30", () => {
    assert.equal(parseCandidateListQuery({}).view, "ai");
    assert.equal(parseCandidateListQuery({ view: "recent" }).view, "recent");
    assert.equal(parseCandidateListQuery({ view: "older" }).status, "pending");
    assert.equal(AI_RECOMMEND_MAX_BATCH, 30);
  });

  it("48h lookback helper and payload builder stay body-free", () => {
    const cutoff = "2026-08-21T12:00:00.000Z";
    assert.equal(
      isCandidateWithinLookback({
        rssPublishedAt: "2026-08-22T00:00:00.000Z",
        createdAt: "2026-08-20T00:00:00.000Z",
        cutoffIso: cutoff,
      }),
      true
    );
    assert.equal(
      isCandidateWithinLookback({
        rssPublishedAt: null,
        createdAt: "2026-08-20T00:00:00.000Z",
        cutoffIso: cutoff,
      }),
      false
    );

    const user = buildAiRecommendUserPayload([
      { id: "1", title: "Title", summary: "Dek", source: "ap" },
    ]);
    assert.match(user, /"title":"Title"/);
    assert.doesNotMatch(user, /body/i);
  });
});
