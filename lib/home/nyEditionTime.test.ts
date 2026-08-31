import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { endOfPriorNyEditionMs, startOfNyDateKeyMs } from "@/lib/home/nyEditionTime";
import { getEditionDateKey } from "@/lib/home/todayEdition";

describe("nyEditionTime", () => {
  it("computes start of NY edition day and prior edition boundary", () => {
    const nowMs = Date.parse("2026-08-31T16:00:00.000Z");
    const editionKey = getEditionDateKey(nowMs);
    assert.equal(editionKey, "2026-08-31");

    const startMs = startOfNyDateKeyMs(editionKey);
    assert.ok(startMs > 0);
    assert.equal(endOfPriorNyEditionMs(editionKey), startMs - 1);
  });
});
