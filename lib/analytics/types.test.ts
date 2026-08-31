import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hashSearchQuery,
  isAllowedAnalyticsEvent,
  sanitizeSearchQuery,
} from "@/lib/analytics/types";

describe("analytics types", () => {
  it("allowlists known events only", () => {
    assert.equal(isAllowedAnalyticsEvent("page_view"), true);
    assert.equal(isAllowedAnalyticsEvent("evil_event"), false);
  });

  it("sanitizes and hashes search queries", () => {
    const q = sanitizeSearchQuery("  hello\tworld  ");
    assert.equal(q, "helloworld");
    assert.match(hashSearchQuery(q!), /^q\d+$/);
  });
});
