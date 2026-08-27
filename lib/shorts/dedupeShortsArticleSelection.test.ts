import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dedupeShortsArticleSelection } from "./dedupeShortsArticleSelection";

describe("dedupeShortsArticleSelection", () => {
  it("removes clear SAME EVENT duplicates and keeps first article", () => {
    const articles = [
      {
        id: "a1",
        title_ko: "서울 강남 아파트 화재, 소방 당국 진화 중",
        title_original: null,
        summary_ko: "강남구 아파트에서 화재가 발생해 소방이 진화 작업 중이다.",
        summary_original: null,
        source: "yonhap",
        published_at: "2026-08-26T01:00:00.000Z",
      },
      {
        id: "a2",
        title_ko: "강남 아파트 화재… 소방 당국 진화 작업",
        title_original: null,
        summary_ko: "서울 강남 아파트 화재, 소방 당국이 진화 작업을 벌이고 있다.",
        summary_original: null,
        source: "chosun",
        published_at: "2026-08-26T02:00:00.000Z",
      },
      {
        id: "a3",
        title_ko: "코스피 1% 상승 마감",
        title_original: null,
        summary_ko: "코스피가 1% 상승하며 마감했다.",
        summary_original: null,
        source: "insight",
        published_at: "2026-08-26T03:00:00.000Z",
      },
    ];

    const result = dedupeShortsArticleSelection(articles);
    assert.equal(result.kept.length, 2);
    assert.equal(result.removed.length, 1);
    assert.equal(result.removed[0]?.id, "a2");
    assert.ok(result.kept.some((a) => a.id === "a1"));
    assert.ok(result.kept.some((a) => a.id === "a3"));
  });
});
