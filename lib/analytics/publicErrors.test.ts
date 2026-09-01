import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PUBLIC_ANALYTICS_ERROR_CODES,
  isPublicAnalyticsErrorCode,
  toPublicAnalyticsError,
} from "./publicErrors";

describe("public analytics errors", () => {
  it("maps internal supabase and env failures to generic public codes", () => {
    assert.equal(
      toPublicAnalyticsError("relation analytics_events does not exist", {
        code: "42P01",
        message: "relation analytics_events does not exist",
      }),
      "analytics_unavailable"
    );
    assert.equal(
      toPublicAnalyticsError("SUPABASE_SERVICE_ROLE_KEY missing"),
      "analytics_unavailable"
    );
    assert.equal(
      toPublicAnalyticsError("DNS lookup failed for abcdefgh.supabase.co"),
      "analytics_unavailable"
    );
    assert.equal(
      toPublicAnalyticsError("insert failed", { code: "22001", message: "value too long" }),
      "analytics_store_failed"
    );
  });

  it("never returns raw internal messages as public error codes", () => {
    const internal = "permission denied for table analytics_events";
    const code = toPublicAnalyticsError(internal, { message: internal });
    assert.equal(isPublicAnalyticsErrorCode(code), true);
    assert.equal(PUBLIC_ANALYTICS_ERROR_CODES.includes(code), true);
    assert.doesNotMatch(code, /analytics_events/i);
    assert.doesNotMatch(code, /supabase/i);
    assert.doesNotMatch(code, /permission denied/i);
  });

  it("passes through already-public validation codes", () => {
    assert.equal(toPublicAnalyticsError("invalid_path"), "invalid_path");
    assert.equal(toPublicAnalyticsError("missing_session"), "missing_session");
  });
});
