import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateAnalyticsOrigin } from "./validateAnalyticsOrigin";

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request("https://www.hannoon.co/api/analytics/event", {
    method: "POST",
    headers,
  });
}

describe("analytics origin validation", () => {
  it("allows same-origin requests when Origin matches Host", () => {
    const result = validateAnalyticsOrigin(
      requestWithHeaders({
        host: "www.hannoon.co",
        origin: "https://www.hannoon.co",
      })
    );
    assert.equal(result.ok, true);
  });

  it("allows hannoon.co and www.hannoon.co as the same site", () => {
    const result = validateAnalyticsOrigin(
      requestWithHeaders({
        host: "hannoon.co",
        origin: "https://www.hannoon.co",
      })
    );
    assert.equal(result.ok, true);
  });

  it("allows requests without Origin header", () => {
    const result = validateAnalyticsOrigin(
      requestWithHeaders({ host: "www.hannoon.co" })
    );
    assert.equal(result.ok, true);
  });

  it("rejects cross-origin browser requests", () => {
    const result = validateAnalyticsOrigin(
      requestWithHeaders({
        host: "www.hannoon.co",
        origin: "https://evil.example",
      })
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "origin_not_allowed");
  });
});
