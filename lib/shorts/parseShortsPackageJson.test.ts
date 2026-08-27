import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SHORTS_CLOSING_LINE } from "./shortsPackageTypes";
import { parseShortsProductionPackageJson } from "./parseShortsPackageJson";

const validBase = {
  title: "한눈 아침뉴스 · 2026-08-26",
  hook: "오늘의 핵심 이슈",
  narration: `미국과 국제 이슈를 정리합니다. ${SHORTS_CLOSING_LINE}`,
  scenes: [
    { index: 1, subtitle: "첫 장면", visualPlan: "헤드라인 카드" },
  ],
  articleMediaSuggestions: [
    {
      articleId: "id-1",
      title: "기사 1",
      url: "https://example.com/1",
      imageSuggestion: "썸네일",
      videoSuggestion: "B-roll",
    },
  ],
  sourceArticles: [
    {
      articleId: "id-1",
      title: "기사 1",
      hannoonUrl: "https://www.hannoon.co/ko/article/x",
      sourceDisplayName: "ap",
      originalUrl: "https://example.com/1",
    },
  ],
  estimatedDurationSec: 75,
  closingLine: SHORTS_CLOSING_LINE,
};

describe("parseShortsProductionPackageJson", () => {
  it("accepts valid package JSON", () => {
    const result = parseShortsProductionPackageJson(validBase);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.package.title, validBase.title);
      assert.equal(result.package.estimatedDurationSec, 75);
      assert.equal(result.package.sourceArticles[0]?.hannoonUrl, validBase.sourceArticles[0].hannoonUrl);
    }
  });

  it("rejects missing narration fields", () => {
    const result = parseShortsProductionPackageJson({ ...validBase, title: "" });
    assert.equal(result.ok, false);
  });

  it("rejects duration outside 60–90 seconds", () => {
    const result = parseShortsProductionPackageJson({
      ...validBase,
      estimatedDurationSec: 45,
    });
    assert.equal(result.ok, false);
  });

  it("requires closing line in narration or closingLine field", () => {
    const result = parseShortsProductionPackageJson({
      ...validBase,
      narration: "마무리 문구 없음",
      closingLine: "다른 문구",
    });
    assert.equal(result.ok, false);
  });
});
