import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildAnalyticsDedupeKey,
  ANALYTICS_SESSION_TTL_MS,
  parseStoredAnonymousSession,
  resolveAnonymousSession,
  resolveExternalReferrerDomain,
} from "./types";
import {
  hasRecordedSearchSubmit,
  markSearchSubmitRecorded,
  searchSubmitStorageKey,
} from "../../components/analytics/AnalyticsSearchSubmit";

describe("search submit single authoritative path", () => {
  it("does not send search_submit from home search navigation", () => {
    const source = readFileSync(
      new URL("../../components/home/HomeNewsSearch.tsx", import.meta.url),
      "utf8"
    );
    assert.doesNotMatch(source, /navigateToSearchPage[\s\S]*search_submit/);
  });

  it("dedupes search_submit without path differences", () => {
    const homePath = buildAnalyticsDedupeKey({
      sessionId: "sess",
      eventName: "search_submit",
      searchQuery: "election",
      path: "/ko",
      minuteBucket: 42,
    });
    const resultsPath = buildAnalyticsDedupeKey({
      sessionId: "sess",
      eventName: "search_submit",
      searchQuery: "election",
      path: "/ko/search",
      minuteBucket: 42,
    });
    assert.equal(homePath, resultsPath);
  });
});

describe("search submit strict-mode guard helpers", () => {
  it("uses sessionStorage keys per locale and normalized query", () => {
    assert.equal(
      searchSubmitStorageKey("ko", "  Hello "),
      searchSubmitStorageKey("ko", "hello")
    );
    assert.notEqual(
      searchSubmitStorageKey("ko", "hello"),
      searchSubmitStorageKey("en", "hello")
    );
  });

  it("exports sessionStorage guard helpers for single page-load recording", () => {
    assert.equal(typeof hasRecordedSearchSubmit, "function");
    assert.equal(typeof markSearchSubmitRecorded, "function");
  });
});

describe("anonymous session rotation", () => {
  it("reuses session id within 24 hours", () => {
    const now = Date.UTC(2026, 8, 1, 12, 0, 0);
    const stored = { id: "abc123", createdAt: now - 60_000 };
    const resolved = resolveAnonymousSession(stored, now);
    assert.equal(resolved.id, "abc123");
    assert.equal(resolved.createdAt, stored.createdAt);
  });

  it("rotates session id after 24 hours", () => {
    const now = Date.UTC(2026, 8, 2, 12, 0, 0);
    const stored = { id: "abc123", createdAt: now - ANALYTICS_SESSION_TTL_MS - 1 };
    const resolved = resolveAnonymousSession(stored, now);
    assert.notEqual(resolved.id, "abc123");
    assert.equal(resolved.createdAt, now);
  });

  it("recovers from corrupted localStorage by creating a new session", () => {
    const now = Date.UTC(2026, 8, 1, 12, 0, 0);
    assert.equal(parseStoredAnonymousSession("{not-json"), null);
    const resolved = resolveAnonymousSession(null, now);
    assert.ok(resolved.id.length > 0);
    assert.equal(resolved.createdAt, now);
  });
});

describe("external referrer resolution", () => {
  it("treats same-site navigation as null referrer", () => {
    assert.equal(
      resolveExternalReferrerDomain(
        "https://www.hannoon.co/ko",
        "hannoon.co"
      ),
      null
    );
    assert.equal(
      resolveExternalReferrerDomain(
        "https://miracle-news-git-feature.vercel.app/ko",
        "miracle-news-git-feature.vercel.app"
      ),
      null
    );
  });

  it("keeps only external hostnames", () => {
    assert.equal(
      resolveExternalReferrerDomain(
        "https://news.google.com/reader",
        "www.hannoon.co"
      ),
      "news.google.com"
    );
  });

  it("does not store full referrer URL or path", () => {
    const domain = resolveExternalReferrerDomain(
      "https://news.google.com/reader?x=1",
      "www.hannoon.co"
    );
    assert.equal(domain, "news.google.com");
    assert.doesNotMatch(domain ?? "", /\//);
    assert.doesNotMatch(domain ?? "", /\?/);
  });
});
