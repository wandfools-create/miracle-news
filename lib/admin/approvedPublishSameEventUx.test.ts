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
    assert.match(src, /allowSameEventOverride/);
    assert.match(src, /same_event_guard/);
    assert.match(src, /redirect\(/);
    assert.doesNotMatch(
      src,
      /throw new Error\(\s*`유사한 공개 기사가 있습니다/
    );
  });

  it("approved page shows block banner and explicit override only when blocked", () => {
    const page = read("app/admin/(app)/approved/page.tsx");
    assert.match(page, /유사한 공개 기사가 있어 공개를 차단했습니다/);
    assert.match(page, /그래도 공개 \(관리자 override\)/);
    assert.match(page, /allowSameEventOverride/);
    assert.match(page, /publishArticleFromForm/);
    assert.match(page, /admin\/review\/\$\{sameEventBlock\.matchId\}/);
  });

  it("keeps publishArticleToLive SAME EVENT logic unchanged", () => {
    const publish = read("lib/articles/publishArticle.ts");
    assert.match(publish, /step: "same_event_guard"/);
    assert.match(publish, /allowSameEventOverride/);
    assert.match(publish, /evaluatePublishedSameEventGuard/);
  });

  it("mirrors quick-review redirect query params for match metadata", () => {
    const approved = read("app/admin/(app)/approved/actions.ts");
    const quick = read("app/admin/(app)/quick-review/actions.ts");
    for (const key of [
      "sameEvent",
      "matchId",
      "matchTitle",
      "matchSource",
      "matchPublishedAt",
    ]) {
      assert.match(approved, new RegExp(key));
      assert.match(quick, new RegExp(key));
    }
  });
});
