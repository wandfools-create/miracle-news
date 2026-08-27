import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Fixture/source scan: admin actions must gate on requireShortsAdmin
 * before create/update (no unauthenticated write path).
 */
describe("shorts actions auth wiring (fixture)", () => {
  it("requires admin before package mutations", () => {
    const actionsPath = path.join(
      process.cwd(),
      "app/admin/(app)/shorts/actions.ts"
    );
    const source = readFileSync(actionsPath, "utf8");
    assert.ok(source.includes("requireShortsAdmin"));
    assert.ok(source.includes("generateShortsPackageAction"));
    assert.ok(source.includes("saveShortsPackageDraftAction"));
    assert.ok(source.includes("markShortsPackageReviewedAction"));
    assert.ok(source.includes("revertShortsPackageToDraftAction"));

    for (const fn of [
      "generateShortsPackageAction",
      "saveShortsPackageDraftAction",
      "markShortsPackageReviewedAction",
      "revertShortsPackageToDraftAction",
    ]) {
      const idx = source.indexOf(`export async function ${fn}`);
      assert.ok(idx >= 0, `missing ${fn}`);
      const body = source.slice(idx, idx + 500);
      assert.ok(
        body.includes("requireShortsAdmin"),
        `${fn} must call requireShortsAdmin early`
      );
    }

    // Generation failure must not reach repo.create
    const gen = source.slice(
      source.indexOf("generateShortsPackageAction"),
      source.indexOf("saveShortsPackageDraftAction")
    );
    assert.ok(gen.includes("if (!generated.ok)"));
    assert.ok(gen.includes("repo.create"));
    assert.ok(
      gen.indexOf("if (!generated.ok)") < gen.indexOf("repo.create"),
      "must return before create on generation failure"
    );
  });
});
