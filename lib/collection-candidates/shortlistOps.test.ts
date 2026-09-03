import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CANDIDATE_STATUS_LABELS } from "./types";
import { candidateStatusAfterEnrichFailure } from "./candidateFailureStatus";

describe("editorial shortlist wiring (fixture / source scan)", () => {
  it("defines shortlisted status label as 선정됨", () => {
    assert.equal(CANDIDATE_STATUS_LABELS.shortlisted, "선정됨");
  });

  it("promote claimable statuses include shortlisted", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/collection-candidates/promoteCollectionCandidate.ts"),
      "utf8"
    );
    assert.match(src, /CLAIMABLE_STATUSES[\s\S]*shortlisted/);
  });

  it("keeps failed shortlist enriches in the editorial shortlist", () => {
    assert.equal(candidateStatusAfterEnrichFailure("shortlisted"), "shortlisted");
    assert.equal(candidateStatusAfterEnrichFailure("pending"), "enrich_failed");
    assert.equal(candidateStatusAfterEnrichFailure("enrich_failed"), "enrich_failed");
  });

  it("persists shortlist failures only while the candidate is claimed", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/collection-candidates/promoteCollectionCandidate.ts"),
      "utf8"
    );
    assert.match(src, /candidateStatusAfterEnrichFailure\(row\.status\)/);
    assert.match(src, /status:\s*failureStatus/);
    assert.match(src, /\.eq\("status",\s*"enriching"\)/);
  });

  it("shortlist ops avoid OpenAI imports", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/collection-candidates/shortlistOps.ts"),
      "utf8"
    );
    assert.doesNotMatch(src, /from ["']@\/lib\/openai/);
    assert.doesNotMatch(src, /chatCompletionJson/);
    assert.match(src, /status:\s*"shortlisted"/);
    assert.match(src, /status:\s*"pending"/);
  });

  it("shortlist ops return updated ids (not count-only success)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/collection-candidates/shortlistOps.ts"),
      "utf8"
    );
    assert.match(src, /\{ ok: true; count: number; ids: string\[\] \}/);
    assert.match(src, /\.select\("id"\)/);
  });
});
