import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getAmericaNewYorkParts,
  VERCEL_CRON_DESK_KR_UTC,
  VERCEL_CRON_DESK_US_UTC,
} from "@/lib/cron/americaNewYork";
import {
  COLLECT_REGION_KOREA,
  COLLECT_REGION_US_INTL,
  defaultMaxCandidatesForRegion,
  isSourceInCollectRegion,
  KOREA_SOURCE_KEYS,
  RSS_MAX_CANDIDATES_KOREA,
  RSS_MAX_CANDIDATES_US_INTL,
  US_INTL_SOURCE_KEYS,
} from "@/lib/rss/collectRegions";
import {
  getActiveRssFeedSources,
  getActiveRssPublisherKeys,
  RSS_FEED_SOURCES,
} from "@/lib/rss/feedSources";

describe("regional desk orchestrator cron (fixture only)", () => {
  it("places Korea Herald on us-intl and KR publishers on korea", () => {
    const kh = RSS_FEED_SOURCES.find((f) => f.sourceKey === "korea-herald");
    assert.ok(kh);
    assert.equal(kh.collectRegion, COLLECT_REGION_US_INTL);
    assert.ok(isSourceInCollectRegion("korea-herald", COLLECT_REGION_US_INTL));
    assert.ok(!isSourceInCollectRegion("korea-herald", COLLECT_REGION_KOREA));

    for (const key of [
      "chosun",
      "tvchosun",
      "yonhap-kr-radar",
      "insight",
    ] as const) {
      assert.ok(isSourceInCollectRegion(key, COLLECT_REGION_KOREA));
      assert.ok(
        RSS_FEED_SOURCES.filter((f) => f.sourceKey === key).every(
          (f) => f.collectRegion === COLLECT_REGION_KOREA
        )
      );
    }
    assert.ok(KOREA_SOURCE_KEYS.includes("joongang"));
    assert.ok(KOREA_SOURCE_KEYS.includes("insight"));
  });

  it("filters active feeds by region with separate caps", () => {
    const us = getActiveRssFeedSources(COLLECT_REGION_US_INTL);
    const kr = getActiveRssFeedSources(COLLECT_REGION_KOREA);
    assert.equal(us.length, 7);
    assert.equal(kr.length, 13);
    assert.deepEqual(
      getActiveRssPublisherKeys(COLLECT_REGION_US_INTL).sort(),
      [...US_INTL_SOURCE_KEYS].sort()
    );
    assert.deepEqual(getActiveRssPublisherKeys(COLLECT_REGION_KOREA).sort(), [
      "chosun",
      "insight",
      "tvchosun",
      "yonhap-kr-radar",
    ]);
    assert.equal(defaultMaxCandidatesForRegion(COLLECT_REGION_US_INTL), 20);
    assert.equal(defaultMaxCandidatesForRegion(COLLECT_REGION_KOREA), 15);
    assert.equal(RSS_MAX_CANDIDATES_US_INTL, 20);
    assert.equal(RSS_MAX_CANDIDATES_KOREA, 15);
  });

  it("vercel.json registers exactly two desk orchestrator crons", () => {
    const raw = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    const vercel = JSON.parse(raw) as {
      crons: { path: string; schedule: string }[];
    };
    assert.equal(vercel.crons.length, 2);
    assert.deepEqual(
      vercel.crons.map((c) => c.path).sort(),
      ["/api/cron/desk-kr", "/api/cron/desk-us"]
    );
    assert.equal(
      vercel.crons.find((c) => c.path === "/api/cron/desk-us")?.schedule,
      VERCEL_CRON_DESK_US_UTC
    );
    assert.equal(
      vercel.crons.find((c) => c.path === "/api/cron/desk-kr")?.schedule,
      VERCEL_CRON_DESK_KR_UTC
    );
    assert.equal(VERCEL_CRON_DESK_US_UTC, "0 12 * * *");
    assert.equal(VERCEL_CRON_DESK_KR_UTC, "0 0 * * *");

    for (const path of [
      "/api/cron/collect-news",
      "/api/cron/collect-news-us",
      "/api/cron/collect-news-kr",
      "/api/cron/morning-brief",
      "/api/cron/morning-brief-us",
      "/api/cron/morning-brief-kr",
    ]) {
      assert.equal(
        vercel.crons.some((c) => c.path === path),
        false,
        `${path} must not be in vercel.json crons`
      );
    }
  });

  it("fixed UTC maps to ~8am/8pm ET with ±1h DST drift", () => {
    // US desk 12:00 UTC
    assert.equal(
      getAmericaNewYorkParts(new Date("2026-07-15T12:00:00.000Z")).hour,
      8
    ); // EDT
    assert.equal(
      getAmericaNewYorkParts(new Date("2026-01-15T12:00:00.000Z")).hour,
      7
    ); // EST (−1h)

    // Korea desk 00:00 UTC
    assert.equal(
      getAmericaNewYorkParts(new Date("2026-07-16T00:00:00.000Z")).hour,
      20
    ); // EDT
    assert.equal(
      getAmericaNewYorkParts(new Date("2026-01-16T00:00:00.000Z")).hour,
      19
    ); // EST (−1h)
  });

  it("desk orchestrator runs collect → recommend → discord independently", () => {
    const orch = readFileSync(
      join(process.cwd(), "lib/cron/runRegionalDeskOrchestrator.ts"),
      "utf8"
    );
    assert.match(orch, /runRegionalCollect/);
    assert.match(orch, /runMorningBriefRecommend/);
    assert.match(orch, /runMorningBriefDiscord/);
    assert.match(orch, /maybeSendDeskSystemAlert/);
    assert.match(orch, /order:\s*\["collect",\s*"recommend",\s*"discord"\]/);
    assert.equal((orch.match(/try \{/g) ?? []).length >= 3, true);
    assert.doesNotMatch(orch, /from ["']@\/lib\/openai/);

    const us = readFileSync(
      join(process.cwd(), "app/api/cron/desk-us/route.ts"),
      "utf8"
    );
    const kr = readFileSync(
      join(process.cwd(), "app/api/cron/desk-kr/route.ts"),
      "utf8"
    );
    assert.match(us, /COLLECT_REGION_US_INTL/);
    assert.match(kr, /COLLECT_REGION_KOREA/);
  });
});
