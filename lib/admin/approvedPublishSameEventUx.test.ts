import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("approved publish SAME EVENT UX (fixture only)", () => {
  it("does not throw Application-error style Error for same_event_guard", () => {
    const src = read("app/admin/(app)/approved/actions.ts");
    assert.match(src, /publishArticleFromForm/);
    assert.match(src, /publishApprovedArticleToLive/);
    assert.doesNotMatch(
      src,
      /throw new Error\(\s*`유사한 공개 기사가 있습니다/
    );
  });

  it("approved page shows batch result banner instead of per-article override", () => {
    const page = read("app/admin/(app)/approved/page.tsx");
    assert.match(page, /ApprovedBulkPublishResult/);
    assert.match(page, /최종 사람 결정/);
    assert.doesNotMatch(page, /그래도 공개 \(관리자 override\)/);
    assert.doesNotMatch(page, /allowSameEventOverride/);
  });

  it("keeps publishArticleToLive SAME EVENT guard for non-human paths", () => {
    const publish = read("lib/articles/publishArticle.ts");
    assert.match(publish, /step: "same_event_guard"/);
    assert.match(publish, /allowSameEventOverride/);
    assert.match(publish, /sameEventPublishResultMetadata/);
    assert.match(publish, /publishApprovedArticleToLive/);
    assert.match(publish, /evaluatePublishedSameEventGuard/);
  });

  it("quick-review still uses allowSameEventOverride redirect params", () => {
    const quick = read("app/admin/(app)/quick-review/actions.ts");
    for (const key of [
      "sameEvent",
      "matchId",
      "matchTitle",
      "matchSource",
      "matchPublishedAt",
    ]) {
      assert.match(quick, new RegExp(key));
    }
  });
});
