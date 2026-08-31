import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterCandidatesByRunKey,
  summarizeCollectionRuns,
} from "@/lib/collection-candidates/groupCandidatesByRun";

describe("groupCandidatesByRun", () => {
  it("groups by collection_run_id when present", () => {
    const rows = [
      {
        id: "a",
        source: "ap",
        status: "pending" as const,
        collection_run_id: "run-1",
        created_at: "2026-08-31T10:00:00.000Z",
      },
      {
        id: "b",
        source: "bbc",
        status: "dismissed" as const,
        collection_run_id: "run-1",
        created_at: "2026-08-31T10:05:00.000Z",
      },
    ];
    const summaries = summarizeCollectionRuns(rows);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.runId, "run-1");
    assert.equal(summaries[0]?.pending, 1);
    assert.equal(summaries[0]?.dismissed, 1);
  });

  it("filters candidates by run key", () => {
    const rows = [
      {
        id: "a",
        source: "ap",
        status: "pending" as const,
        collection_run_id: "run-1",
        created_at: "2026-08-31T10:00:00.000Z",
      },
      {
        id: "b",
        source: "bbc",
        status: "pending" as const,
        collection_run_id: "run-2",
        created_at: "2026-08-31T16:00:00.000Z",
      },
    ];
    const filtered = filterCandidatesByRunKey(rows, "run:run-1");
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.id, "a");
  });
});
