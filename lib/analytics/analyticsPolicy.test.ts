import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildAnalyticsDedupeKey,
  ANALYTICS_SESSION_TTL_MS,
  parseStoredAnonymousSession,
  resolveAnonymousSession,
  resolveExternalReferrerDomain,
  resolveStoredReferrerDomain,
  shouldStoreReferrerForEvent,
} from "./types";

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

describe("search submit strict-mode and minute dedupe", () => {
  it("uses useRef guard instead of sessionStorage lifetime blocking", () => {
    const source = readFileSync(
      new URL("../../components/analytics/AnalyticsSearchSubmit.tsx", import.meta.url),
      "utf8"
    );
    assert.match(source, /useRef/);
    assert.doesNotMatch(source, /sessionStorage/);
  });

  it("allows the same query again in a later minute bucket", () => {
    const minuteA = buildAnalyticsDedupeKey({
      sessionId: "sess",
      eventName: "search_submit",
      searchQuery: "election",
      minuteBucket: 100,
    });
    const minuteB = buildAnalyticsDedupeKey({
      sessionId: "sess",
      eventName: "search_submit",
      searchQuery: "election",
      minuteBucket: 101,
    });
    assert.notEqual(minuteA, minuteB);
  });

  it("dedupes the same session and query within one minute", () => {
    const first = buildAnalyticsDedupeKey({
      sessionId: "sess",
      eventName: "search_submit",
      searchQuery: "election",
      minuteBucket: 200,
    });
    const second = buildAnalyticsDedupeKey({
      sessionId: "sess",
      eventName: "search_submit",
      searchQuery: "election",
      minuteBucket: 200,
    });
    assert.equal(first, second);
  });
});

describe("referrer storage policy", () => {
  it("stores referrer only for entry events", () => {
    assert.equal(shouldStoreReferrerForEvent("page_view"), true);
    assert.equal(shouldStoreReferrerForEvent("article_view"), true);
    assert.equal(shouldStoreReferrerForEvent("article_click"), false);
    assert.equal(shouldStoreReferrerForEvent("search_result_click"), false);
    assert.equal(shouldStoreReferrerForEvent("language_switch"), false);
  });

  it("drops referrer for action events even when external", () => {
    assert.equal(
      resolveStoredReferrerDomain(
        "article_click",
        "https://news.google.com/",
        "www.hannoon.co"
      ),
      null
    );
    assert.equal(
      resolveStoredReferrerDomain(
        "page_view",
        "https://news.google.com/",
        "www.hannoon.co"
      ),
      "news.google.com"
    );
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
