import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RSS_FEED_SOURCES } from "./feedSources";
import {
  evaluateRssItemAge,
  RSS_MAX_INSERTS_PER_FEED,
  RSS_MAX_ITEM_AGE_MS,
} from "./rssItemFreshness";

describe("RSS ops expansion (fixture only, no OpenAI)", () => {
  it("registers 8 feeds including KR / BBC / ScienceDaily", () => {
    const keys = RSS_FEED_SOURCES.map((f) => f.sourceKey);
    assert.deepEqual(
      keys,
      [
        "pbs-newshour",
        "ap",
        "fox-news",
        "csm",
        "yonhap",
        "korea-herald",
        "bbc",
        "sciencedaily",
      ]
    );
    assert.equal(RSS_FEED_SOURCES.length, 8);
  });

  it("uses Korea Herald newsAll XML endpoint (not HTML /rss index)", () => {
    const kh = RSS_FEED_SOURCES.find((f) => f.sourceKey === "korea-herald");
    assert.ok(kh);
    assert.equal(kh.feedUrl, "https://www.koreaherald.com/rss/newsAll");
  });

  it("caps per-feed inserts at 5 and item age at 72h", () => {
    assert.equal(RSS_MAX_INSERTS_PER_FEED, 5);
    assert.equal(RSS_MAX_ITEM_AGE_MS, 72 * 60 * 60 * 1000);
  });

  it("skips items older than 72h and allows unknown publishedAt", () => {
    const now = Date.parse("2026-08-23T12:00:00.000Z");
    const fresh = evaluateRssItemAge("2026-08-22T12:00:00.000Z", now);
    assert.equal(fresh.action, "allow");
    assert.equal(fresh.reason, "fresh");

    const old = evaluateRssItemAge("2026-08-19T11:00:00.000Z", now);
    assert.equal(old.action, "skip_old");

    const unknown = evaluateRssItemAge(null, now);
    assert.equal(unknown.action, "allow");
    assert.equal(unknown.reason, "unknown_published_at");
  });

  it("theoretical daily max candidates is min(30, 8*5)=30", () => {
    const defaultRunCap = 30;
    const theoretical = Math.min(
      defaultRunCap,
      RSS_FEED_SOURCES.length * RSS_MAX_INSERTS_PER_FEED
    );
    assert.equal(theoretical, 30);
  });
});
