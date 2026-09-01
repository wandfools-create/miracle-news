import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const routeSource = readFileSync(
  new URL("../../app/api/analytics/event/route.ts", import.meta.url),
  "utf8"
);
const recordSource = readFileSync(
  new URL("./recordAnalyticsEvent.ts", import.meta.url),
  "utf8"
);

describe("analytics API response safety", () => {
  it("route uses public error helper instead of returning raw result messages", () => {
    assert.match(routeSource, /publicErrorResponse/);
    assert.doesNotMatch(routeSource, /error\.message/);
    assert.doesNotMatch(routeSource, /NextResponse\.json\(result/);
  });

  it("record path maps storage failures to public codes only", () => {
    assert.match(recordSource, /analytics_unavailable/);
    assert.match(recordSource, /toPublicAnalyticsError/);
    assert.doesNotMatch(recordSource, /error: error\.message/);
    assert.doesNotMatch(recordSource, /return \{ ok: false, error: envCheck\.error \}/);
  });
});
