import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("desk mutations (redirect-free, fixture / source scan)", () => {
  it("deskMutationActions return results and do not redirect", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "app/admin/(app)/collection-candidates/deskMutationActions.ts"
      ),
      "utf8"
    );
    assert.doesNotMatch(src, /from ["']next\/navigation["']/);
    assert.doesNotMatch(src, /\bredirect\s*\(/);
    assert.match(src, /deskDismissCandidatesAction/);
    assert.match(src, /deskShortlistCandidatesAction/);
    assert.match(src, /deskExpireCandidatesAction/);
    assert.match(src, /result\.count === 0/);
    assert.doesNotMatch(src, /revalidatePath\(\s*["']\/admin\/collection-candidates["']/);
  });

  it("workbench uses desk actions with local list removal, not form redirects", () => {
    const src = readFileSync(
      join(process.cwd(), "components/admin/CollectionCandidatesWorkbench.tsx"),
      "utf8"
    );
    assert.match(src, /deskDismissCandidatesAction/);
    assert.match(src, /deskShortlistCandidatesAction/);
    assert.match(src, /deskExpireCandidatesAction/);
    assert.match(src, /removeIdsFromView/);
    assert.match(src, /window\.scrollY/);
    assert.doesNotMatch(src, /DismissCandidateForm/);
    assert.doesNotMatch(src, /ShortlistCandidateForm/);
    assert.doesNotMatch(src, /bulkDismissCandidatesAction/);
    assert.doesNotMatch(src, /bulkShortlistCandidatesAction/);
    assert.doesNotMatch(src, /bulkExpireCandidatesAction/);
    assert.match(src, /useBulkCandidateEnrich/);
    assert.match(src, /runBulkEnrich/);
    assert.doesNotMatch(src, /bulkEnrichCandidatesAction/);
    assert.doesNotMatch(src, /Promise\.all/);
  });

  it("dismiss op verifies updated row and logs failure on 0 rows", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "lib/collection-candidates/dismissCollectionCandidate.ts"
      ),
      "utf8"
    );
    assert.match(src, /status:\s*"dismissed"/);
    assert.match(src, /dismiss updated 0 rows/);
    assert.match(src, /\.select\("id"\);/);
    assert.doesNotMatch(src, /\.select\("id"\)\s*\.maybeSingle\s*\(/);
    assert.doesNotMatch(src, /from ["']@\/lib\/openai/);
  });

  it("shortlist / bulk ops return ids and avoid OpenAI", () => {
    const shortlist = readFileSync(
      join(process.cwd(), "lib/collection-candidates/shortlistOps.ts"),
      "utf8"
    );
    const bulk = readFileSync(
      join(process.cwd(), "lib/collection-candidates/bulkCandidateOps.ts"),
      "utf8"
    );
    assert.match(shortlist, /ids: updatedIds/);
    assert.match(bulk, /ids: updatedIds/);
    assert.doesNotMatch(shortlist, /from ["']@\/lib\/openai/);
    assert.doesNotMatch(bulk, /from ["']@\/lib\/openai/);
  });
});
