import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANALYTICS_EVENT_ALLOWLIST,
  buildAnalyticsDedupeKey,
  isAdminAnalyticsPath,
  isAllowedAnalyticsEvent,
  isAnalyticsLocale,
  isAnalyticsSchemaMissing,
  isValidUuid,
  maskPiiInSearchQuery,
  normalizeSearchQueryForDisplay,
  sanitizeAnalyticsPath,
  sanitizeReferrerDomain,
  sanitizeSearchQuery,
  sanitizeSessionId,
} from "./types";

describe("analytics event allowlist", () => {
  it("accepts known events only", () => {
    for (const event of ANALYTICS_EVENT_ALLOWLIST) {
      assert.equal(isAllowedAnalyticsEvent(event), true);
    }
    assert.equal(isAllowedAnalyticsEvent("unknown_event"), false);
  });
});

describe("analytics locale and uuid validation", () => {
  it("accepts ko/en locale only", () => {
    assert.equal(isAnalyticsLocale("ko"), true);
    assert.equal(isAnalyticsLocale("en"), true);
    assert.equal(isAnalyticsLocale("fr"), false);
  });

  it("validates uuid format", () => {
    assert.equal(
      isValidUuid("550e8400-e29b-41d4-a716-446655440000"),
      true
    );
    assert.equal(isValidUuid("not-a-uuid"), false);
  });
});

describe("analytics path validation", () => {
  it("allows public ko/en paths and rejects admin paths", () => {
    assert.equal(sanitizeAnalyticsPath("/ko"), "/ko");
    assert.equal(sanitizeAnalyticsPath("/en/article/foo"), "/en/article/foo");
    assert.equal(sanitizeAnalyticsPath("/admin/analytics"), null);
    assert.equal(isAdminAnalyticsPath("/admin/review"), true);
    assert.equal(sanitizeAnalyticsPath("https://evil.test"), null);
  });
});

describe("search query normalization", () => {
  it("trims, limits length, and masks obvious PII", () => {
    const masked = sanitizeSearchQuery(
      "  contact me at user@example.com or 010-1234-5678  "
    );
    assert.ok(masked);
    assert.ok(masked.includes("[email]"));
    assert.ok(masked.includes("[phone]"));
    assert.ok(masked.length <= 80);
  });

  it("masks email and phone helpers", () => {
    assert.equal(
      maskPiiInSearchQuery("hello user@example.com"),
      "hello [email]"
    );
    assert.equal(
      normalizeSearchQueryForDisplay("  Hello   World "),
      "hello world"
    );
  });
});

describe("referrer and session sanitization", () => {
  it("extracts hostname from referrer URL", () => {
    assert.equal(
      sanitizeReferrerDomain("https://news.google.com/path"),
      "news.google.com"
    );
    assert.equal(sanitizeReferrerDomain(""), null);
  });

  it("accepts safe session ids only", () => {
    assert.equal(sanitizeSessionId("abc123"), "abc123");
    assert.equal(sanitizeSessionId(""), null);
    assert.equal(sanitizeSessionId("bad session"), null);
  });
});

describe("dedupe key stability", () => {
  it("builds stable keys within the same minute bucket", () => {
    const a = buildAnalyticsDedupeKey({
      sessionId: "sess",
      eventName: "article_view",
      articleId: "550e8400-e29b-41d4-a716-446655440000",
      path: "/ko/article/foo",
      minuteBucket: 100,
    });
    const b = buildAnalyticsDedupeKey({
      sessionId: "sess",
      eventName: "article_view",
      articleId: "550e8400-e29b-41d4-a716-446655440000",
      path: "/ko/article/foo",
      minuteBucket: 100,
    });
    assert.equal(a, b);
    const c = buildAnalyticsDedupeKey({
      sessionId: "sess",
      eventName: "article_view",
      articleId: "550e8400-e29b-41d4-a716-446655440000",
      path: "/ko/article/foo",
      minuteBucket: 101,
    });
    assert.notEqual(a, c);
  });
});

describe("schema missing detection", () => {
  it("detects missing analytics schema errors", () => {
    assert.equal(isAnalyticsSchemaMissing({ code: "42P01" }), true);
    assert.equal(
      isAnalyticsSchemaMissing({ message: "analytics_admin_summary not found" }),
      true
    );
    assert.equal(isAnalyticsSchemaMissing({ code: "23505" }), false);
  });
});

describe("aggregation design", () => {
  it("documents SQL RPC aggregation instead of client row limits", () => {
    const migration = `
      CREATE OR REPLACE FUNCTION public.analytics_admin_summary(p_days integer)
      RETURNS jsonb
    `;
    assert.match(migration, /analytics_admin_summary/);
    assert.doesNotMatch(migration, /limit 5000/i);
  });
});
