import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  failedEnrichCandidateIds,
  mapPromoteToEnrichItemResult,
  runSequentialCandidateEnrich,
  summarizeBulkCandidateEnrich,
  unexpectedEnrichItemResult,
} from "./candidateEnrichBulk";

describe("bulk candidate enrich isolation (fixture only)", () => {
  it("revalidateCandidateQueues does not call itself", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "app/admin/(app)/collection-candidates/bulkCandidateActions.ts"
      ),
      "utf8"
    );
    assert.match(src, /revalidatePath\("\/admin\/collection-candidates"\)/);
    assert.doesNotMatch(src, /revalidateCandidateQueues\(\)\s*;\s*\n\s*revalidateCandidateQueues\(\)/);
    const matches = src.match(/revalidateCandidateQueues\(/g) ?? [];
    assert.ok(matches.length >= 1);
    assert.ok(!src.includes("revalidateCandidateQueues();\n  revalidateCandidateQueues();"));
  });

  it("revalidateShortlistQueues does not call itself", () => {
    const src = readFileSync(
      join(process.cwd(), "app/admin/(app)/collection-shortlist/actions.ts"),
      "utf8"
    );
    assert.match(src, /revalidatePath\("\/admin\/collection-shortlist"\)/);
    assert.ok(!src.includes("revalidateShortlistQueues();\n  revalidateShortlistQueues();"));
  });

  it("maps promote results to safe bulk outcomes", () => {
    const base = { candidateId: "c1", candidateTitle: "Title A" };

    const success = mapPromoteToEnrichItemResult({
      ...base,
      promote: { ok: true, articleId: "a1" },
    });
    assert.equal(success.outcome, "success");
    assert.equal(success.articleId, "a1");

    const already = mapPromoteToEnrichItemResult({
      ...base,
      promote: { ok: true, articleId: "a1", alreadyEnriched: true },
    });
    assert.equal(already.outcome, "already_enriched");

    const sameEvent = mapPromoteToEnrichItemResult({
      ...base,
      promote: {
        ok: false,
        error: "dup",
        step: "same_event_published",
        sameEventArticleId: "pub1",
        sameEventTitle: "Existing",
      },
    });
    assert.equal(sameEvent.outcome, "same_event_blocked");
    assert.equal(sameEvent.sameEventArticleId, "pub1");

    const status = mapPromoteToEnrichItemResult({
      ...base,
      promote: {
        ok: false,
        error: "expired",
        step: "status_guard",
      },
    });
    assert.equal(status.outcome, "status_blocked");

    const failed = mapPromoteToEnrichItemResult({
      ...base,
      promote: {
        ok: false,
        error: "body extract failed",
        step: "body_extract",
      },
    });
    assert.equal(failed.outcome, "enrich_failed");
    assert.ok(failed.safeMessage);
    assert.doesNotMatch(failed.safeMessage ?? "", /secret/i);
  });

  it("continues after throw on item 2 of 5", async () => {
    const ids = ["1", "2", "3", "4", "5"];
    const titles = new Map(ids.map((id) => [id, `Title ${id}`]));
    let calls = 0;

    const results = await runSequentialCandidateEnrich(
      ids,
      titles,
      async (candidateId) => {
        calls += 1;
        if (candidateId === "2") {
          throw new Error("timeout");
        }
        return mapPromoteToEnrichItemResult({
          candidateId,
          candidateTitle: `Title ${candidateId}`,
          promote: { ok: true, articleId: `a-${candidateId}` },
        });
      }
    );

    assert.equal(calls, 5);
    assert.equal(results.length, 5);
    assert.equal(results[1]?.outcome, "unexpected_error");
    assert.equal(results[0]?.outcome, "success");
    assert.equal(results[2]?.outcome, "success");
    assert.equal(results[4]?.outcome, "success");
  });

  it("summarizes 2 success and 3 failures accurately", async () => {
    const ids = ["1", "2", "3", "4", "5"];
    const titles = new Map(ids.map((id) => [id, `T${id}`]));

    const results = await runSequentialCandidateEnrich(ids, titles, async (id) => {
      if (id === "2" || id === "4" || id === "5") {
        return mapPromoteToEnrichItemResult({
          candidateId: id,
          candidateTitle: `T${id}`,
          promote: { ok: false, error: "fail", step: "body_extract" },
        });
      }
      return mapPromoteToEnrichItemResult({
        candidateId: id,
        candidateTitle: `T${id}`,
        promote: { ok: true, articleId: `a${id}` },
      });
    });

    const summary = summarizeBulkCandidateEnrich(results);
    assert.equal(summary.success, 2);
    assert.equal(summary.enrichFailed, 3);
    assert.deepEqual(failedEnrichCandidateIds(summary), ["2", "4", "5"]);
  });

  it("continues after SAME EVENT block on one item", async () => {
    const ids = ["a", "b", "c"];
    const titles = new Map([
      ["a", "A"],
      ["b", "B"],
      ["c", "C"],
    ]);

    const results = await runSequentialCandidateEnrich(ids, titles, async (id) => {
      if (id === "b") {
        return mapPromoteToEnrichItemResult({
          candidateId: id,
          candidateTitle: "B",
          promote: {
            ok: false,
            error: "same",
            step: "same_event_published",
            sameEventArticleId: "x",
            sameEventTitle: "Match",
          },
        });
      }
      return mapPromoteToEnrichItemResult({
        candidateId: id,
        candidateTitle: id.toUpperCase(),
        promote: { ok: true, articleId: id },
      });
    });

    assert.equal(results.length, 3);
    assert.equal(results[1]?.outcome, "same_event_blocked");
    assert.equal(results[0]?.outcome, "success");
    assert.equal(results[2]?.outcome, "success");
  });

  it("treats already enriched as success without duplicate create", () => {
    const mapped = mapPromoteToEnrichItemResult({
      candidateId: "c1",
      candidateTitle: "T",
      promote: { ok: true, articleId: "existing", alreadyEnriched: true },
    });
    assert.equal(mapped.outcome, "already_enriched");
    assert.equal(mapped.articleId, "existing");
  });

  it("network-style failure returns unexpected_error and next item runs", async () => {
    const results = await runSequentialCandidateEnrich(
      ["1", "2"],
      new Map([
        ["1", "One"],
        ["2", "Two"],
      ]),
      async (id) => {
        if (id === "1") throw new TypeError("network");
        return mapPromoteToEnrichItemResult({
          candidateId: id,
          candidateTitle: id,
          promote: { ok: true, articleId: "a2" },
        });
      }
    );
    assert.equal(results[0]?.outcome, "unexpected_error");
    assert.equal(results[1]?.outcome, "success");
  });

  it("workbench uses single-candidate action sequentially without Promise.all", () => {
    for (const file of [
      "components/admin/CollectionCandidatesWorkbench.tsx",
      "components/admin/CollectionShortlistWorkbench.tsx",
    ]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      assert.match(src, /useBulkCandidateEnrich/);
      assert.match(src, /runBulkEnrich/);
      assert.doesNotMatch(src, /Promise\.all/);
      assert.doesNotMatch(src, /bulkEnrichCandidatesAction/);
      assert.doesNotMatch(src, /bulkEnrichFromShortlistAction/);
    }

    const hook = readFileSync(
      join(process.cwd(), "components/admin/useBulkCandidateEnrich.ts"),
      "utf8"
    );
    assert.match(hook, /enrichSingleCandidateAction/);
    assert.match(hook, /runSequentialCandidateEnrich/);
    assert.doesNotMatch(hook, /Promise\.all/);
  });

  it("single enrich action is redirect-free and accepts one candidateId", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "app/admin/(app)/collection-candidates/enrichSingleCandidateAction.ts"
      ),
      "utf8"
    );
    assert.doesNotMatch(src, /\bredirect\s*\(/);
    assert.match(src, /enrichSingleCandidateAction/);
    assert.match(src, /isValidArticleUuid/);
    assert.match(src, /mapPromoteToEnrichItemResult/);
    assert.doesNotMatch(src, /for\s*\(.*candidateId/);
  });

  it("unexpected enrich item has safe message only", () => {
    const item = unexpectedEnrichItemResult({
      candidateId: "c1",
      candidateTitle: "T",
    });
    assert.equal(item.outcome, "unexpected_error");
    assert.ok(item.safeMessage);
    assert.doesNotMatch(item.safeMessage ?? "", /stack|secret|password/i);
  });
});
