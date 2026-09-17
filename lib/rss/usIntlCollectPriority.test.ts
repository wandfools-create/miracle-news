import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  isUsIntlNonCoreLifestyle,
  scoreUsIntlCollectPriority,
  selectUsIntlItemsByPriority,
  shouldBypassUsIntlFieldExclude,
  type UsIntlPriorityCandidate,
} from "@/lib/rss/usIntlCollectPriority";

describe("usIntlCollectPriority scoring", () => {
  it("scores infectious disease and war as P0", () => {
    assert.equal(
      scoreUsIntlCollectPriority({
        title: "CDC reports measles outbreak with hospitalizations rising",
        summary: "Public health emergency declared",
      }),
      0
    );
    assert.equal(
      scoreUsIntlCollectPriority({
        title: "Missile strikes hit city as ceasefire talks stall",
        summary: null,
      }),
      0
    );
  });

  it("scores US politics, diplomacy, and world economy as P1", () => {
    assert.equal(
      scoreUsIntlCollectPriority({
        title: "Senate passes bill; White House weighs veto",
      }),
      1
    );
    assert.equal(
      scoreUsIntlCollectPriority({
        title: "US and NATO discuss Ukraine sanctions package",
      }),
      1
    );
    assert.equal(
      scoreUsIntlCollectPriority({
        title: "Federal Reserve raises interest rates amid inflation fight",
      }),
      1
    );
  });

  it("marks EXO, Snapchat, horoscope, lifestyle as non-core P3", () => {
    assert.equal(
      isUsIntlNonCoreLifestyle({
        title: "EXO’s CBX heads to China amid legal dispute: report",
      }),
      true
    );
    assert.equal(
      scoreUsIntlCollectPriority({
        title: "Snapchat considering daily time limits for teens",
      }),
      3
    );
    assert.equal(
      scoreUsIntlCollectPriority({
        title: "Today's horoscope: zodiac signs to watch",
      }),
      3
    );
    assert.equal(
      scoreUsIntlCollectPriority({
        title: "Inspirational quote of the day for a better life",
      }),
      3
    );
  });

  it("does not treat soft lifestyle as non-core when P0 signals present", () => {
    assert.equal(
      isUsIntlNonCoreLifestyle({
        title: "Celebrity clinic reports cholera outbreak hospitalizations",
        summary: "CDC confirms community spread",
      }),
      false
    );
    assert.equal(
      scoreUsIntlCollectPriority({
        title: "Celebrity clinic reports cholera outbreak hospitalizations",
        summary: "CDC confirms community spread",
      }),
      0
    );
  });
});

describe("usIntlCollectPriority field-exclude bypass", () => {
  it("lets P0/P1 bypass unclassified and disabled-field misclassification", () => {
    assert.equal(
      shouldBypassUsIntlFieldExclude({
        priority: 0,
        decisionKey: "unclassified-reject",
      }),
      true
    );
    assert.equal(
      shouldBypassUsIntlFieldExclude({
        priority: 1,
        decisionKey: "field-disabled:economy.energy",
      }),
      true
    );
    assert.equal(
      shouldBypassUsIntlFieldExclude({
        priority: 1,
        decisionKey: "science-lifestyle-disabled",
      }),
      true
    );
  });

  it("does not bypass for P2/P3 or hard country/keyword excludes", () => {
    assert.equal(
      shouldBypassUsIntlFieldExclude({
        priority: 2,
        decisionKey: "unclassified-reject",
      }),
      false
    );
    assert.equal(
      shouldBypassUsIntlFieldExclude({
        priority: 0,
        decisionKey: "country-exclude:xx",
      }),
      false
    );
    assert.equal(
      shouldBypassUsIntlFieldExclude({
        priority: 1,
        decisionKey: "field-exclude-kw:politics.government",
      }),
      false
    );
  });
});

describe("usIntlCollectPriority selection", () => {
  function cand(
    partial: Partial<UsIntlPriorityCandidate<string>> &
      Pick<UsIntlPriorityCandidate<string>, "item" | "priority" | "feedIndex">
  ): UsIntlPriorityCandidate<string> {
    return {
      publishedAtMs: 0,
      sourceKey: "ap",
      feedUrl: `https://example.com/${partial.feedIndex}`,
      independentInsertCap: true,
      maxInserts: 4,
      ...partial,
    };
  }

  it("prefers later P0/P1 over earlier non-core within the same feed ranking", () => {
    const selected = selectUsIntlItemsByPriority(
      [
        cand({
          item: "exo-early",
          priority: 3,
          feedIndex: 0,
          publishedAtMs: 2_000,
        }),
        cand({
          item: "war-late",
          priority: 0,
          feedIndex: 0,
          publishedAtMs: 1_000,
        }),
        cand({
          item: "snapchat",
          priority: 3,
          feedIndex: 0,
          publishedAtMs: 1_500,
        }),
      ],
      20
    );
    const items = selected.selectedByFeed.get(0) ?? [];
    assert.deepEqual(items, ["war-late"]);
    assert.equal(selected.nonSaveDropped.length, 2);
  });

  it("fills run limit 20 with P0/P1 before P2 and never pads with P3", () => {
    const candidates: UsIntlPriorityCandidate<string>[] = [];
    for (let i = 0; i < 8; i++) {
      candidates.push(
        cand({
          item: `p0-${i}`,
          priority: 0,
          feedIndex: i,
          feedUrl: `https://ex.com/${i}`,
          publishedAtMs: 1000 - i,
        })
      );
    }
    for (let i = 0; i < 8; i++) {
      candidates.push(
        cand({
          item: `p1-${i}`,
          priority: 1,
          feedIndex: 10 + i,
          feedUrl: `https://ex.com/p1-${i}`,
          publishedAtMs: 900 - i,
        })
      );
    }
    for (let i = 0; i < 10; i++) {
      candidates.push(
        cand({
          item: `p2-${i}`,
          priority: 2,
          feedIndex: 20 + i,
          feedUrl: `https://ex.com/p2-${i}`,
          publishedAtMs: 800 - i,
        })
      );
    }
    for (let i = 0; i < 10; i++) {
      candidates.push(
        cand({
          item: `p3-${i}`,
          priority: 3,
          feedIndex: 30 + i,
          feedUrl: `https://ex.com/p3-${i}`,
          publishedAtMs: 700 - i,
        })
      );
    }

    const selected = selectUsIntlItemsByPriority(candidates, 20);
    const flat = [...selected.selectedByFeed.values()].flat();
    assert.equal(flat.length, 20);
    assert.equal(flat.filter((x) => x.startsWith("p0-")).length, 8);
    assert.equal(flat.filter((x) => x.startsWith("p1-")).length, 8);
    assert.equal(flat.filter((x) => x.startsWith("p2-")).length, 4);
    assert.equal(flat.filter((x) => x.startsWith("p3-")).length, 0);
    assert.equal(selected.nonSaveDropped.length, 10);
    assert.equal(selected.runLimitUnprocessed.length, 6); // remaining P2
  });

  it("does not raise per-feed max inserts above 4", () => {
    const candidates = Array.from({ length: 8 }, (_, i) =>
      cand({
        item: `item-${i}`,
        priority: 0,
        feedIndex: 0,
        feedUrl: "https://ex.com/same",
        independentInsertCap: true,
        maxInserts: 4,
        publishedAtMs: 1000 - i,
      })
    );
    const selected = selectUsIntlItemsByPriority(candidates, 20);
    assert.equal((selected.selectedByFeed.get(0) ?? []).length, 4);
    assert.equal(selected.feedCapDropped.length, 4);
  });
});

describe("usIntlCollectPriority wiring (source scan)", () => {
  it("collectRss wires priority selection for us-intl only and never imports OpenAI", () => {
    const collectSrc = readFileSync(
      join(process.cwd(), "lib/rss/collectRssToReviewQueue.ts"),
      "utf8"
    );
    const prioritySrc = readFileSync(
      join(process.cwd(), "lib/rss/usIntlCollectPriority.ts"),
      "utf8"
    );
    assert.match(collectSrc, /applyUsIntlPrioritySelection/);
    assert.match(collectSrc, /COLLECT_REGION_US_INTL/);
    assert.match(collectSrc, /shouldBypassUsIntlFieldExclude/);
    assert.match(collectSrc, /isUsIntlNonCoreLifestyle/);
    assert.doesNotMatch(collectSrc, /from ["']@\/lib\/openai/);
    assert.doesNotMatch(prioritySrc, /from ["']@\/lib\/openai/);
    assert.doesNotMatch(prioritySrc, /openai\.com|chat\.completions/i);
  });
});
