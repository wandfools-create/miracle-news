import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  batchRelatedStoriesForCandidates,
  findRelatedStoriesForDoc,
  type RelatedStoryPoolRow,
} from "@/lib/same-event/relatedStoriesMatch";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function poolRow(
  partial: Partial<RelatedStoryPoolRow> & Pick<RelatedStoryPoolRow, "id" | "title">
): RelatedStoryPoolRow {
  return {
    kind: "article",
    source: "ap",
    summary: null,
    titleAlt: null,
    summaryAlt: null,
    publishedAt: "2026-08-26T00:00:00.000Z",
    hasThumbnail: true,
    statusLabel: "공개됨",
    href: `/admin/review/${partial.id}`,
    ...partial,
  };
}

describe("related stories for collection candidates", () => {
  it("shows SAME EVENT and UPDATE without title-only fuzzy match", () => {
    const pool: RelatedStoryPoolRow[] = [
      poolRow({
        id: "pub1",
        title:
          '오세훈 "윤리위 정치는 하위 정치"·한동훈 "당 퇴행"…나란히 張 비판',
        summary: "오세훈 시장과 한동훈이 장동혁을 직격 비판했다.",
        source: "tvchosun",
      }),
      poolRow({
        id: "unrelated",
        title: "미국 연준 금리 동결 전망",
        summary: "연준이 금리를 유지할 것으로 보인다.",
        source: "ap",
      }),
    ];

    const related = findRelatedStoriesForDoc(
      {
        id: "cand1",
        title: '오세훈·한동훈, 한 자리서 장동혁 직격…"하위 정치" "당 퇴행해"',
        summary: "국민의힘 내부에서 장동혁 대표 노선을 비판했다.",
        source: "tvchosun",
        publishedAt: "2026-08-26T01:00:00.000Z",
      },
      pool,
      { excludeId: "cand1" }
    );

    assert.equal(related.length, 1);
    assert.equal(related[0]!.id, "pub1");
    assert.equal(related[0]!.relation, "same_event");
    assert.equal(related[0]!.relationLabel, "SAME EVENT");
  });

  it("batchRelatedStoriesForCandidates maps per candidate without self-match", () => {
    const pool: RelatedStoryPoolRow[] = [
      poolRow({
        id: "a-update",
        title: "Nepal evacuates thousands after glacier lake outburst",
        summary: "Authorities ordered evacuations as flood risk grew.",
        source: "bbc",
      }),
    ];

    const map = batchRelatedStoriesForCandidates(
      [
        {
          id: "c1",
          source: "ap",
          rssTitle: "Nepal missing persons rise after Himalayan flood",
          rssSummary: "Search continues for missing after outburst.",
          rssPublishedAt: "2026-08-27T00:00:00.000Z",
          articleId: null,
        },
      ],
      pool
    );

    const hits = map.get("c1") ?? [];
    assert.ok(hits.length >= 1);
    assert.ok(
      hits.some(
        (h) =>
          h.relation === "update" ||
          h.relation === "different_angle" ||
          h.relation === "same_event" ||
          h.relation === "ambiguous_possible"
      )
    );
    assert.ok(!hits.some((h) => h.id === "c1"));
  });

  it("batchRelatedStoriesForCandidates completes 50×400 within fixture budget", () => {
    const pool: RelatedStoryPoolRow[] = Array.from({ length: 400 }, (_, i) =>
      poolRow({
        id: `p${i}`,
        title: `Story headline ${i} about policy and economy`,
        summary: `Summary body ${i}`,
        source: i % 2 === 0 ? "ap" : "bbc",
      })
    );
    const candidates = Array.from({ length: 50 }, (_, i) => ({
      id: `cand-${i}`,
      source: "ap",
      rssTitle: `Candidate ${i} policy economy headline`,
      rssSummary: `Candidate summary ${i}`,
      rssPublishedAt: "2026-08-27T00:00:00.000Z",
      articleId: null as string | null,
    }));

    const start = performance.now();
    batchRelatedStoriesForCandidates(candidates, pool);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 3000, `expected <3s, got ${elapsed}ms`);
  });
});

describe("related stories admin wiring (fixture only)", () => {
  it("loads pool once on collection-candidates page", () => {
    const page = read("app/admin/(app)/collection-candidates/page.tsx");
    assert.match(page, /loadRelatedStoryPool/);
    assert.match(page, /batchRelatedStoriesForCandidates/);
    assert.match(page, /relatedStoryPoolCapped/);
  });

  it("renders CandidateRelatedStoriesPanel in workbench", () => {
    const workbench = read("components/admin/CollectionCandidatesWorkbench.tsx");
    assert.match(workbench, /CandidateRelatedStoriesPanel/);
    assert.match(workbench, /relatedStoriesMap/);
  });
});
