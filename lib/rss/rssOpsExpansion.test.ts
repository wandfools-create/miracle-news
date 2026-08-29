import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getActiveRssFeedSources,
  getActiveRssPublisherKeys,
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
  publisherQuotaRemaining,
  simulatePublisherCategoryRotation,
  simulatePublisherSeedPass,
} from "./rssPublisherFairness";
import {
  pickRssCategories,
  pickRssThumbnailUrl,
} from "./parseRssFeed";
import {
  getRssItemSkipReason,
  TVCHOSUN_BROADCAST_TITLE_PATTERNS,
} from "./rssItemPrefilter";
import {
  buildRssSourceHealthRows,
  getRssSourceHealthLabel,
} from "./rssSourceHealth";

describe("RSS ops expansion (fixture only, no OpenAI)", () => {
  it("registers KR Chosun + TV Chosun category feeds with shared source keys", () => {
    const chosun = RSS_FEED_SOURCES.filter((f) => f.sourceKey === "chosun");
    const tv = RSS_FEED_SOURCES.filter((f) => f.sourceKey === "tvchosun");
    assert.equal(chosun.length, 4);
    assert.equal(tv.length, 4);
    assert.deepEqual(
      chosun.map((f) => f.category),
      ["politics", "economy", "society", "world"]
    );
    assert.deepEqual(
      tv.map((f) => f.category),
      ["politics", "economy", "society", "world"]
    );
    assert.ok(
      chosun.every((f) =>
        f.feedUrl.includes("/arc/outboundfeeds/rss/category/")
      )
    );
    assert.ok(
      !RSS_FEED_SOURCES.some((f) =>
        f.feedUrl.includes("outboundfeeds/rss/?outputType=xml")
      )
    );
    assert.ok(!tv.some((f) => f.feedUrl.includes("society.xml")));
    assert.equal(
      RSS_FEED_SOURCES.some((f) => f.sourceKey === "cnn"),
      false
    );
  });

  it("registers PBS headlines and politics feeds under pbs-newshour", () => {
    const pbs = RSS_FEED_SOURCES.filter((f) => f.sourceKey === "pbs-newshour");
    assert.equal(pbs.length, 2);
    assert.ok(
      pbs.some(
        (f) =>
          f.feedUrl === "https://www.pbs.org/newshour/feeds/rss/headlines"
      )
    );
    const politics = pbs.find(
      (f) => f.feedUrl === "https://www.pbs.org/newshour/feeds/rss/politics"
    );
    assert.ok(politics);
    assert.equal(politics.category, "politics");
    assert.equal(politics.collectRegion, "us-intl");
  });

  it("disables Yonhap English from active collection (row kept)", () => {
    assert.equal(isRssFeedSourceEnabled("yonhap"), false);
    assert.equal(getRssSourceHealthLabel("yonhap"), "비활성");
    const activeKeys = getActiveRssFeedSources().map((f) => f.sourceKey);
    assert.equal(activeKeys.includes("yonhap"), false);
    assert.equal(getActiveRssFeedSources().length, 22);
    assert.equal(getActiveRssPublisherKeys().length, 12);
    assert.ok(RSS_FEED_SOURCES.some((f) => f.sourceKey === "yonhap"));
    assert.ok(
      getActiveRssFeedSources().some((f) => f.sourceKey === "yonhap-kr-radar")
    );
    assert.ok(
      getActiveRssFeedSources().some((f) => f.sourceKey === "insight")
    );
  });

  it("source health marks Yonhap inactive without OpenAI", () => {
    const rows = buildRssSourceHealthRows();
    const yonhap = rows.find((r) => r.sourceKey === "yonhap");
    assert.ok(yonhap);
    assert.equal(yonhap.status, "비활성");
    assert.equal(yonhap.enabled, false);
  });

  it("uses Korea Herald newsAll XML endpoint on us-intl desk", () => {
    const kh = RSS_FEED_SOURCES.find((f) => f.sourceKey === "korea-herald");
    assert.ok(kh);
    assert.equal(kh.feedUrl, "https://www.koreaherald.com/rss/newsAll");
    assert.equal(isRssFeedSourceEnabled("korea-herald"), true);
    assert.equal(kh.collectRegion, "us-intl");
  });

  it("caps per-publisher inserts at 4 with first-pass fair share of 3", () => {
    assert.equal(RSS_MAX_INSERTS_PER_FEED, 4);
    assert.equal(RSS_FIRST_PASS_INSERTS_PER_FEED, 3);
    assert.equal(RSS_MAX_ITEM_AGE_MS, 72 * 60 * 60 * 1000);
  });

  it("fair quota: pass1 gives every publisher a turn before pass2 fills to 4", () => {
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
    // Main publishers (excl. radar) pass1 cannot exceed run cap alone
    const mainPublishers = getActiveRssPublisherKeys().filter(
      (k) => k !== "yonhap-kr-radar"
    ).length;
    const pass1Ceiling = mainPublishers * RSS_FIRST_PASS_INSERTS_PER_FEED;
    assert.ok(pass1Ceiling >= 30);
  });

  it("publisher quota shared with category rotation spreads across feeds", () => {
    const feeds = [
      { sourceKey: "chosun", category: "politics", saved: 0, queueLength: 10 },
      { sourceKey: "chosun", category: "economy", saved: 0, queueLength: 10 },
      { sourceKey: "chosun", category: "society", saved: 0, queueLength: 10 },
      { sourceKey: "chosun", category: "world", saved: 0, queueLength: 10 },
    ];
    const pass1Quota = publisherQuotaRemaining(1, 0);
    assert.equal(pass1Quota, 3);
    const afterPass1 = simulatePublisherCategoryRotation(feeds, pass1Quota);
    const politics = afterPass1.find((f) => f.category === "politics")!;
    const economy = afterPass1.find((f) => f.category === "economy")!;
    const society = afterPass1.find((f) => f.category === "society")!;
    assert.equal(politics.saved, 1);
    assert.equal(economy.saved, 1);
    assert.equal(society.saved, 1);
    assert.equal(
      afterPass1.reduce((n, f) => n + f.saved, 0),
      3
    );

    const pass2Quota = publisherQuotaRemaining(
      2,
      afterPass1.reduce((n, f) => n + f.saved, 0)
    );
    assert.equal(pass2Quota, 1);
    const afterPass2 = simulatePublisherCategoryRotation(afterPass1, pass2Quota);
    assert.equal(
      afterPass2.reduce((n, f) => n + f.saved, 0),
      4
    );
  });

  it("publisher seed pass gives each publisher one opportunity before second save", () => {
    const totals = simulatePublisherSeedPass([
      [{ sourceKey: "ap", saved: 0, queueLength: 5 }],
      [{ sourceKey: "fox-news", saved: 0, queueLength: 5 }],
      [
        { sourceKey: "chosun", category: "politics", saved: 0, queueLength: 5 },
        { sourceKey: "chosun", category: "economy", saved: 0, queueLength: 5 },
      ],
    ]);
    assert.equal(totals.get("ap"), 1);
    assert.equal(totals.get("fox-news"), 1);
    assert.equal(totals.get("chosun"), 1);
  });

  it("collect loop uses publisher seed and category rotation (source scan)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/rss/collectRssToReviewQueue.ts"),
      "utf8"
    );
    assert.match(src, /publisher seed|drainMainPublishersFair/);
    assert.match(src, /drainPublisherWithCategoryRotation/);
    assert.match(src, /rotateCategoryFeeds/);
    assert.match(src, /fair pass/);
    assert.match(src, /rssFeedInsertQuota/);
    assert.match(src, /drainFeedInsertQuota/);
    assert.match(src, /publisherSavedCount/);
    assert.match(src, /yonhap-kr-radar|YONHAP_KR_RADAR/);
    assert.match(src, /yna-sitemap-radar/);
    assert.match(src, /insight-section-list/);
    assert.match(src, /fetchInsightSectionListItems/);
    assert.match(src, /drainMainPublishersFair/);
    assert.match(src, /pass === 0/);
    assert.match(src, /rssFeedInsertQuota/);
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

  it("theoretical run max is min(30, main*4 + radar*3)", () => {
    const defaultRunCap = 30;
    const main = getActiveRssPublisherKeys().filter(
      (k) => k !== "yonhap-kr-radar"
    ).length;
    const theoretical = Math.min(
      defaultRunCap,
      main * RSS_MAX_INSERTS_PER_FEED + 3
    );
    assert.equal(theoretical, 30);
  });

  it("picks thumbnail from media/enclosure fixtures (null allowed)", () => {
    assert.equal(
      pickRssThumbnailUrl({
        mediaContent: {
          $: {
            url: "https://www.chosun.com/resizer/v2/abc.jpg?auth=x",
            type: "image/jpeg",
          },
        },
      }),
      "https://www.chosun.com/resizer/v2/abc.jpg?auth=x"
    );
    assert.equal(
      pickRssThumbnailUrl({
        enclosure: {
          url: "https://img.tvchosun.com/sitedata/image/202608/24/thumb.jpg",
          type: "image/jpeg",
        },
      }),
      "https://img.tvchosun.com/sitedata/image/202608/24/thumb.jpg"
    );
    assert.equal(pickRssThumbnailUrl({}), null);
  });

  it("parses RSS categories from fixture shapes", () => {
    assert.deepEqual(pickRssCategories({ categories: ["정치"] }), ["정치"]);
    assert.deepEqual(pickRssCategories({ category: "스포츠" }), ["스포츠"]);
  });

  it("filters TV조선 sports category and broadcast titles", () => {
    const sports = getRssItemSkipReason("tvchosun", {
      title: "일반 제목",
      url: "https://news.tvchosun.com/site/data/html_dir/2026/08/24/x.html",
      categories: ["스포츠"],
    });
    assert.ok(sports);
    assert.equal(sports.code, "rss_category");

    const closing = getRssItemSkipReason("tvchosun", {
      title: "8월 24일 '뉴스 9' 클로징",
      url: "https://news.tvchosun.com/site/data/html_dir/2026/08/24/x.html",
      categories: ["사회"],
    });
    assert.ok(closing);
    assert.equal(closing.code, "broadcast_title");

    const ok = getRssItemSkipReason("tvchosun", {
      title: "국세청, 특별재난지역 세금 납부 유예",
      url: "https://news.tvchosun.com/site/data/html_dir/2026/08/24/x.html",
      categories: ["경제"],
    });
    assert.equal(ok, null);

    assert.ok(TVCHOSUN_BROADCAST_TITLE_PATTERNS.length >= 5);
  });

  it("applies sports path filter to Chosun URLs", () => {
    const skip = getRssItemSkipReason("chosun", {
      title: "축구 경기",
      url: "https://www.chosun.com/sports/world-football/2026/08/24/ABC/",
      summary: null,
    });
    assert.ok(skip);
    assert.equal(skip.code, "sports_policy");
  });
});
