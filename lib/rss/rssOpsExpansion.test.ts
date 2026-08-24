import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getActiveRssFeedSources,
  isRssFeedSourceEnabled,
  RSS_FEED_SOURCES,
} from "./feedSources";
import {
  evaluateRssItemAge,
  RSS_FIRST_PASS_INSERTS_PER_FEED,
  RSS_MAX_INSERTS_PER_FEED,
  RSS_MAX_ITEM_AGE_MS,
  rssFeedInsertQuota,
} from "./rssItemFreshness";
import {
  buildRssSourceHealthRows,
  getRssSourceHealthLabel,
} from "./rssSourceHealth";

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
    assert.equal(
      RSS_FEED_SOURCES.some((f) => f.sourceKey === "cnn"),
      false
    );
  });

  it("disables Yonhap English from active collection (row kept)", () => {
    assert.equal(isRssFeedSourceEnabled("yonhap"), false);
    assert.equal(getRssSourceHealthLabel("yonhap"), "비활성");
    const activeKeys = getActiveRssFeedSources().map((f) => f.sourceKey);
    assert.equal(activeKeys.includes("yonhap"), false);
    assert.equal(activeKeys.length, 7);
    assert.ok(RSS_FEED_SOURCES.some((f) => f.sourceKey === "yonhap"));
  });

  it("source health marks Yonhap inactive without OpenAI", () => {
    const rows = buildRssSourceHealthRows();
    const yonhap = rows.find((r) => r.sourceKey === "yonhap");
    assert.ok(yonhap);
    assert.equal(yonhap.status, "비활성");
    assert.equal(yonhap.enabled, false);
  });

  it("uses Korea Herald newsAll XML endpoint (not HTML /rss index)", () => {
    const kh = RSS_FEED_SOURCES.find((f) => f.sourceKey === "korea-herald");
    assert.ok(kh);
    assert.equal(kh.feedUrl, "https://www.koreaherald.com/rss/newsAll");
    assert.equal(isRssFeedSourceEnabled("korea-herald"), true);
  });

  it("caps per-feed inserts at 4 with first-pass fair share of 3", () => {
    assert.equal(RSS_MAX_INSERTS_PER_FEED, 4);
    assert.equal(RSS_FIRST_PASS_INSERTS_PER_FEED, 3);
    assert.equal(RSS_MAX_ITEM_AGE_MS, 72 * 60 * 60 * 1000);
  });

  it("fair quota: pass1 gives every feed a turn before pass2 fills to 4", () => {
    assert.equal(
      rssFeedInsertQuota({
        pass: 1,
        alreadyInserted: 0,
        runBudgetRemaining: 30,
      }),
      3
    );
    assert.equal(
      rssFeedInsertQuota({
        pass: 1,
        alreadyInserted: 3,
        runBudgetRemaining: 20,
      }),
      0
    );
    assert.equal(
      rssFeedInsertQuota({
        pass: 2,
        alreadyInserted: 3,
        runBudgetRemaining: 10,
      }),
      1
    );
    assert.equal(
      rssFeedInsertQuota({
        pass: 2,
        alreadyInserted: 4,
        runBudgetRemaining: 10,
      }),
      0
    );
    // Early feeds cannot take all 30 in pass 1 alone
    const active = getActiveRssFeedSources().length;
    const pass1Ceiling = active * RSS_FIRST_PASS_INSERTS_PER_FEED;
    assert.ok(pass1Ceiling <= 30);
    assert.equal(pass1Ceiling, 21);
  });

  it("collect loop uses fair two-pass drain (source scan)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/rss/collectRssToReviewQueue.ts"),
      "utf8"
    );
    assert.match(src, /fair pass/);
    assert.match(src, /rssFeedInsertQuota/);
    assert.match(src, /drainFeedInsertQuota/);
    assert.match(src, /pass:\s*1/);
    assert.match(src, /pass:\s*2/);
    assert.match(src, /continuing other feeds/);
    assert.doesNotMatch(src, /from ["']@\/lib\/openai/);
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

  it("theoretical run max is min(30, 7*4)=28 for active feeds", () => {
    const defaultRunCap = 30;
    const theoretical = Math.min(
      defaultRunCap,
      getActiveRssFeedSources().length * RSS_MAX_INSERTS_PER_FEED
    );
    assert.equal(theoretical, 28);
  });
});
