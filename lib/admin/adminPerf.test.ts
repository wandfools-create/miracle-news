import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("admin performance phase-1 (fixture)", () => {
  it("centralizes nav badge counts with unstable_cache TTL + tag", () => {
    const src = read("lib/admin/adminNavCounts.ts");
    assert.match(src, /unstable_cache/);
    assert.match(src, /ADMIN_NAV_COUNTS_TAG/);
    assert.match(src, /ADMIN_NAV_COUNTS_TTL_SEC\s*=\s*45/);
    assert.match(src, /fetchAdminNavCountsUncached/);
    assert.match(src, /Promise\.all\(/);
    assert.equal(
      (src.match(/count:\s*"exact"/g) ?? []).length,
      9,
      "uncached fetch should run 9 exact head counts in one batch"
    );
  });

  it("updateTag hook exists for mutation-driven badge refresh", () => {
    const src = read("lib/admin/revalidateAdminNav.ts");
    assert.match(src, /updateTag\(ADMIN_NAV_COUNTS_TAG\)/);
  });

  it("admin layout avoids network auth.getUser (display-only cookie decode)", () => {
    const layout = read("app/admin/(app)/layout.tsx");
    assert.doesNotMatch(layout, /auth\.getUser/);
    assert.doesNotMatch(layout, /createSupabaseServerClient/);
    assert.match(layout, /getAdminNavCounts/);
    assert.match(layout, /readAdminSessionEmailFromCookies/);
  });

  it("readAdminSessionEmail documents proxy remains auth gate", () => {
    const src = read("lib/admin/readAdminSessionEmail.ts");
    assert.match(src, /proxy\.ts/);
    assert.match(src, /Does NOT grant access/);
  });

  it("review list select omits body columns; detail select keeps them", () => {
    const list = read("lib/admin/fetchReviewQueueArticles.ts");
    const listSelect = list.match(
      /REVIEW_QUEUE_LIST_SELECT = `([\s\S]*?)`/
    )?.[1];
    assert.ok(listSelect, "REVIEW_QUEUE_LIST_SELECT");
    assert.doesNotMatch(listSelect, /body_translated/);
    assert.doesNotMatch(listSelect, /body_original/);

    const detailSelect = list.match(
      /REVIEW_QUEUE_ARTICLE_SELECT = `([\s\S]*?)`/
    )?.[1];
    assert.ok(detailSelect, "REVIEW_QUEUE_ARTICLE_SELECT");
    assert.match(detailSelect, /body_translated/);

    const detail = read("app/admin/(app)/review/[id]/page.tsx");
    assert.match(detail, /body_translated/);
    assert.match(detail, /body_original/);
  });

  it("queue list pages omit body fields from select", () => {
    for (const file of [
      "app/admin/(app)/quick-review/page.tsx",
      "app/admin/(app)/revision/page.tsx",
      "app/admin/(app)/on-hold/page.tsx",
      "app/admin/(app)/rejected/page.tsx",
    ]) {
      const src = read(file);
      assert.doesNotMatch(src, /body_translated/, `${file} should not select body_translated`);
      assert.doesNotMatch(src, /body_original/, `${file} should not select body_original`);
    }
  });

  it("unfiltered queue pages reuse cached nav counts instead of duplicate exact count", () => {
    const quick = read("app/admin/(app)/quick-review/page.tsx");
    assert.match(quick, /getAdminNavCounts/);
    assert.doesNotMatch(quick, /count:\s*"exact"/);

    const reviewFetch = read("lib/admin/fetchReviewQueueArticles.ts");
    assert.match(reviewFetch, /getAdminNavCounts\(\)\)\.review/);
  });

  it("revision manual edit lazy-loads body via server action", () => {
    const actions = read("app/admin/(app)/revision/actions.ts");
    assert.match(actions, /fetchRevisionArticleBody/);
    assert.match(actions, /body_translated, body_original/);

    const ui = read("components/admin/RevisionArticleActions.tsx");
    assert.match(ui, /fetchRevisionArticleBody/);
    assert.doesNotMatch(ui, /initialBodyKo/);
  });

  it("service role DNS check is cached for collection candidates", () => {
    const src = read("lib/supabase/serviceRole.ts");
    assert.match(src, /checkSupabaseServiceEnvWithDnsCached/);
    assert.match(src, /DNS_ENV_CACHE_MS/);
  });
});
