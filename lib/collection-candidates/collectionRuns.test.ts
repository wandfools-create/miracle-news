/**
 * Unit C: collection runs + estimated grouping + RSS health summaries.
 * No DB / OpenAI / Discord / RSS network.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveCollectionRunStatus,
  resolveCollectionTriggerType,
  sanitizeCollectionRunErrorSummary,
  isCollectionRunsSchemaMissing,
} from "@/lib/collection-candidates/collectionRunsCore";
import {
  estimateCollectionBucketEndIso,
  estimateCollectionBucketStartIso,
  filterCandidatesByRunKey,
  filterRunSummariesByRegion,
  formatCollectionRunTimeEt,
  inferCandidateCollectRegion,
  parseCollectionRunDbFilter,
  parseRunFilterParam,
  runKeyForCandidate,
  sourceKeysForRunRegionFilter,
  summarizeCollectionRuns,
  type CandidateRunRow,
} from "@/lib/collection-candidates/groupCandidatesByRun";
import { collectRowsByRangePagination } from "@/lib/collection-candidates/candidateFetchPagination";
import {
  applyCollectionRunDbFilter,
  createQueryCallRecorder,
} from "@/lib/collection-candidates/candidateRunDbFilter";
import { ADMIN_LIST_PAGE_SIZE } from "@/lib/admin/listPagination";

function summarizeRssHealth(
  rows: Array<{ status: "ok" | "error" | "inactive" | "unknown"; lastSuccessAt: string | null; lastFailureAt: string | null }>
) {
  let okCount = 0;
  let errorCount = 0;
  let unknownCount = 0;
  let inactiveCount = 0;
  let lastCollectAt: string | null = null;
  for (const row of rows) {
    if (row.status === "ok") okCount += 1;
    else if (row.status === "error") errorCount += 1;
    else if (row.status === "inactive") inactiveCount += 1;
    else unknownCount += 1;
    for (const at of [row.lastSuccessAt, row.lastFailureAt]) {
      if (!at) continue;
      if (!lastCollectAt || at > lastCollectAt) lastCollectAt = at;
    }
  }
  return { okCount, errorCount, unknownCount, inactiveCount, lastCollectAt };
}

function row(
  partial: Partial<CandidateRunRow> & Pick<CandidateRunRow, "id" | "source">
): CandidateRunRow {
  return {
    status: "pending",
    created_at: "2026-08-31T12:30:00.000Z",
    collection_run_id: null,
    source_country: "US",
    ...partial,
  };
}

describe("collectionRuns helpers", () => {
  it("resolves success / partial / failed", () => {
    assert.equal(
      resolveCollectionRunStatus({ newCandidateCount: 3, failedCount: 0 }),
      "success"
    );
    assert.equal(
      resolveCollectionRunStatus({ newCandidateCount: 2, failedCount: 1 }),
      "partial"
    );
    assert.equal(
      resolveCollectionRunStatus({ newCandidateCount: 0, failedCount: 2 }),
      "failed"
    );
    assert.equal(
      resolveCollectionRunStatus({
        newCandidateCount: 5,
        failedCount: 0,
        hardFailed: true,
      }),
      "failed"
    );
  });

  it("infers trigger type from query flags", () => {
    assert.equal(
      resolveCollectionTriggerType(new URLSearchParams("collectOnly=1")),
      "github_actions"
    );
    assert.equal(
      resolveCollectionTriggerType(new URLSearchParams("forceBrief=1")),
      "github_actions"
    );
    assert.equal(
      resolveCollectionTriggerType(new URLSearchParams("manual=1")),
      "manual"
    );
    assert.equal(
      resolveCollectionTriggerType(new URLSearchParams()),
      "vercel_cron"
    );
  });

  it("sanitizes secrets from error summaries", () => {
    const cleaned = sanitizeCollectionRunErrorSummary(
      "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb failed api_key=supersecret"
    );
    assert.ok(cleaned);
    assert.doesNotMatch(cleaned!, /eyJhbGci/);
    assert.doesNotMatch(cleaned!, /supersecret/);
    assert.match(cleaned!, /redacted|jwt|api_key/i);
  });

  it("detects missing collection_runs schema", () => {
    assert.equal(
      isCollectionRunsSchemaMissing({
        code: "PGRST205",
        message: "Could not find the table 'public.collection_runs'",
      }),
      true
    );
    assert.equal(
      isCollectionRunsSchemaMissing({
        code: "42501",
        message: "permission denied",
      }),
      false
    );
  });
});

describe("groupCandidatesByRun", () => {
  it("groups by real collection_run_id", () => {
    const rows = [
      row({
        id: "a",
        source: "ap",
        collection_run_id: "11111111-1111-4111-8111-111111111111",
        created_at: "2026-08-31T12:01:00.000Z",
      }),
      row({
        id: "b",
        source: "bbc",
        collection_run_id: "11111111-1111-4111-8111-111111111111",
        status: "dismissed",
        created_at: "2026-08-31T12:05:00.000Z",
      }),
    ];
    const summaries = summarizeCollectionRuns(rows);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.kind, "real");
    assert.equal(summaries[0]?.pending, 1);
    assert.equal(summaries[0]?.dismissed, 1);
  });

  it("estimates 6h UTC buckets and separates regions", () => {
    const us = row({
      id: "u1",
      source: "ap",
      source_country: "US",
      created_at: "2026-08-31T13:10:00.000Z", // bucket 12:00 UTC
    });
    const kr = row({
      id: "k1",
      source: "chosun",
      source_country: "KR",
      created_at: "2026-08-31T13:15:00.000Z", // same bucket, different region
    });
    const summaries = summarizeCollectionRuns([us, kr]);
    assert.equal(summaries.length, 2);
    assert.ok(summaries.every((s) => s.kind === "estimated"));
    const regions = new Set(summaries.map((s) => s.region));
    assert.ok(regions.has("korea"));
    assert.ok(regions.has("us-intl"));
  });

  it("does not duplicate cards when stored run and candidates share id", () => {
    const runId = "22222222-2222-4222-8222-222222222222";
    const rows = [
      row({
        id: "a",
        source: "ap",
        collection_run_id: runId,
        created_at: "2026-08-31T12:10:00.000Z",
      }),
    ];
    const summaries = summarizeCollectionRuns(rows, [
      {
        id: runId,
        region: "us-intl",
        started_at: "2026-08-31T12:00:00.000Z",
        finished_at: "2026-08-31T12:05:00.000Z",
        status: "success",
        collected_count: 10,
        new_candidate_count: 1,
        failed_count: 0,
      },
    ]);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.kind, "real");
    assert.equal(summaries[0]?.collectedCount, 10);
  });

  it("filters by run key and region", () => {
    const rows = [
      row({
        id: "a",
        source: "ap",
        collection_run_id: "run-a",
        created_at: "2026-08-31T12:00:00.000Z",
      }),
      row({
        id: "b",
        source: "chosun",
        source_country: "KR",
        created_at: "2026-08-31T18:10:00.000Z",
      }),
    ];
    assert.equal(filterCandidatesByRunKey(rows, "run:run-a").length, 1);
    const summaries = summarizeCollectionRuns(rows);
    assert.equal(filterRunSummariesByRegion(summaries, "korea").length, 1);
  });

  it("uses stable sort for equal timestamps", () => {
    const t = "2026-08-31T12:00:00.000Z";
    const rows = [
      row({ id: "b", source: "bbc", created_at: t }),
      row({ id: "a", source: "ap", created_at: t }),
    ];
    const s1 = summarizeCollectionRuns(rows).map((r) => r.runKey);
    const s2 = summarizeCollectionRuns([...rows].reverse()).map((r) => r.runKey);
    assert.deepEqual(s1, s2);
  });

  it("formats ET with timezone name (DST-safe Intl)", () => {
    // August → EDT
    const summer = formatCollectionRunTimeEt("2026-08-15T12:00:00.000Z");
    assert.match(summer, /2026/);
    assert.match(summer, /EDT|GMT-4|UTC-4|동부/i);
    // January → EST
    const winter = formatCollectionRunTimeEt("2026-01-15T12:00:00.000Z");
    assert.match(winter, /EST|GMT-5|UTC-5|동부/i);
  });

  it("maps 6h bucket starts to slot boundaries", () => {
    assert.equal(
      estimateCollectionBucketStartIso("2026-08-31T17:59:59.000Z"),
      "2026-08-31T12:00:00.000Z"
    );
    assert.equal(
      estimateCollectionBucketStartIso("2026-08-31T18:00:00.000Z"),
      "2026-08-31T18:00:00.000Z"
    );
  });

  it("infers region from source keys", () => {
    assert.equal(inferCandidateCollectRegion({ source: "chosun" }), "korea");
    assert.equal(inferCandidateCollectRegion({ source: "ap" }), "us-intl");
  });

  it("parseRunFilterParam normalizes uuid", () => {
    assert.equal(
      parseRunFilterParam("33333333-3333-4333-8333-333333333333"),
      "run:33333333-3333-4333-8333-333333333333"
    );
    assert.equal(parseRunFilterParam("est:korea:x"), "est:korea:x");
  });

  it("runKey prefers real id over estimated bucket", () => {
    const key = runKeyForCandidate(
      row({
        id: "x",
        source: "ap",
        collection_run_id: "abc",
        created_at: "2026-08-31T12:30:00.000Z",
      })
    );
    assert.equal(key, "run:abc");
  });

  it("parseCollectionRunDbFilter builds real and estimated DB predicates", () => {
    const real = parseCollectionRunDbFilter(
      "run:33333333-3333-4333-8333-333333333333"
    );
    assert.deepEqual(real, {
      kind: "real",
      runId: "33333333-3333-4333-8333-333333333333",
    });

    const start = "2026-08-31T12:00:00.000Z";
    const est = parseCollectionRunDbFilter(`est:korea:${start}`);
    assert.equal(est?.kind, "estimated");
    if (est?.kind === "estimated") {
      assert.equal(est.region, "korea");
      assert.equal(est.startedAt, start);
      assert.equal(est.endedAt, estimateCollectionBucketEndIso(start));
      assert.equal(est.endedAt, "2026-08-31T18:00:00.000Z");
    }
  });

  it("applyCollectionRunDbFilter uses collection_run_id for real runs", () => {
    const { api, calls } = createQueryCallRecorder();
    applyCollectionRunDbFilter(api, {
      kind: "real",
      runId: "run-1",
    });
    assert.deepEqual(calls, [
      { method: "eq", args: ["collection_run_id", "run-1"] },
    ]);
  });

  it("applyCollectionRunDbFilter uses time range + region sources for estimated", () => {
    const { api, calls } = createQueryCallRecorder();
    applyCollectionRunDbFilter(api, {
      kind: "estimated",
      region: "us-intl",
      startedAt: "2026-08-31T12:00:00.000Z",
      endedAt: "2026-08-31T18:00:00.000Z",
    });
    assert.deepEqual(calls[0], {
      method: "is",
      args: ["collection_run_id", null],
    });
    assert.deepEqual(calls[1], {
      method: "gte",
      args: ["created_at", "2026-08-31T12:00:00.000Z"],
    });
    assert.deepEqual(calls[2], {
      method: "lt",
      args: ["created_at", "2026-08-31T18:00:00.000Z"],
    });
    assert.equal(calls[3]?.method, "in");
    assert.equal(calls[3]?.args[0], "source");
    assert.ok(
      (calls[3]?.args[1] as string[]).includes("ap")
    );
    assert.ok(sourceKeysForRunRegionFilter("korea")?.includes("chosun"));
  });

  it("range pagination returns all rows beyond 100 and 500", async () => {
    const total = 530;
    const pages: string[][] = [];
    for (let i = 0; i < total; i += ADMIN_LIST_PAGE_SIZE) {
      pages.push(
        Array.from({ length: Math.min(ADMIN_LIST_PAGE_SIZE, total - i) }, (_, j) =>
          `id-${i + j}`
        )
      );
    }
    let pageCalls = 0;
    const result = await collectRowsByRangePagination<string>(
      async (from, to) => {
        pageCalls += 1;
        const pageIndex = Math.floor(from / ADMIN_LIST_PAGE_SIZE);
        assert.equal(to - from + 1, ADMIN_LIST_PAGE_SIZE);
        return { ok: true, rows: pages[pageIndex] ?? [] };
      }
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.rows.length, 530);
      assert.equal(result.rows[0], "id-0");
      assert.equal(result.rows[100], "id-100");
      assert.equal(result.rows[500], "id-500");
      assert.equal(result.rows[529], "id-529");
    }
    assert.ok(pageCalls > 10);
    assert.equal(pageCalls, Math.ceil(530 / ADMIN_LIST_PAGE_SIZE));
  });

  it("stable created_at+id tie-break ordering is documented in fetch", () => {
    const fetchSrc = readFileSync(
      join(process.cwd(), "lib/admin/fetchCollectionCandidates.ts"),
      "utf8"
    );
    assert.match(fetchSrc, /order\("created_at"/);
    assert.match(fetchSrc, /order\("id"/);
    assert.match(fetchSrc, /collectRowsByRangePagination/);
    assert.match(fetchSrc, /parseCollectionRunDbFilter/);
    assert.doesNotMatch(fetchSrc, /\.limit\(500\)/);

    const indexSrc = readFileSync(
      join(process.cwd(), "lib/admin/fetchCollectionRuns.ts"),
      "utf8"
    );
    assert.match(indexSrc, /collectRowsByRangePagination/);
    assert.doesNotMatch(indexSrc, /RUN_INDEX_LIMIT|\.limit\(500\)/);

    const pageSrc = readFileSync(
      join(
        process.cwd(),
        "app/admin/(app)/collection-candidates/page.tsx"
      ),
      "utf8"
    );
    assert.match(pageSrc, /runKey: activeRunKey/);
    assert.match(pageSrc, /pendingOnly: showPendingOnly/);
    assert.doesNotMatch(pageSrc, /byRun\.filter|candidateRunMeta/);
  });
});

describe("RSS health accordion wiring", () => {
  it("summarizeRssHealth never counts unknown as ok", () => {
    const summary = summarizeRssHealth([
      {
        status: "unknown",
        lastSuccessAt: null,
        lastFailureAt: null,
      },
      {
        status: "ok",
        lastSuccessAt: "2026-08-31T12:00:00.000Z",
        lastFailureAt: null,
      },
      {
        status: "error",
        lastSuccessAt: null,
        lastFailureAt: "2026-08-31T11:00:00.000Z",
      },
    ]);
    assert.equal(summary.okCount, 1);
    assert.equal(summary.errorCount, 1);
    assert.equal(summary.unknownCount, 1);
  });

  it("RssSourceHealthPanel defaults collapsed with aria", () => {
    const ui = readFileSync(
      join(process.cwd(), "components/admin/RssSourceHealthPanel.tsx"),
      "utf8"
    );
    assert.match(ui, /useState\(false\)/);
    assert.match(ui, /aria-expanded/);
    assert.match(ui, /aria-controls/);
    assert.match(ui, /type="button"/);
    assert.match(ui, /RSS 수집망 상태/);
  });

  it("CollectionRunPanel expands latest and collapses older", () => {
    const ui = readFileSync(
      join(process.cwd(), "components/admin/CollectionRunPanel.tsx"),
      "utf8"
    );
    assert.match(ui, /이전 회차/);
    assert.match(ui, /<details/);
    assert.match(ui, /실제 회차/);
    assert.match(ui, /추정 회차/);
    assert.match(ui, /전체 보기/);
    assert.match(ui, /focus-visible/);
  });

  it("collect path wires fail-open run create/finish", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/rss/collectRssToReviewQueue.ts"),
      "utf8"
    );
    assert.match(src, /createCollectionRun/);
    assert.match(src, /finishCollectionRun/);
    assert.match(src, /collectionRunId: ctx\.collectionRunId/);
  });

  it("migration hardens collection_runs RLS and FK", () => {
    const sql = readFileSync(
      join(process.cwd(), "migrations/20260901_collection_runs.sql"),
      "utf8"
    );
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.collection_runs/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /TO service_role/);
    assert.match(sql, /REVOKE ALL[\s\S]*FROM anon/);
    assert.match(sql, /collection_candidates_collection_run_id_idx/);
  });
});
