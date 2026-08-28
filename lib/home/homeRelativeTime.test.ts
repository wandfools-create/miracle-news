/**
 * Edition / home relative time — America/New_York fixtures.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatEditionLastUpdated,
  formatHomeRelativeTime,
} from "./homeRelativeTime";

/** 2026-08-28 11:29 America/New_York (EDT = UTC-4) */
const MORNING_ET = "2026-08-28T15:29:00.000Z";
/** 2026-08-28 15:20 America/New_York (EDT) */
const AFTERNOON_ET = "2026-08-28T19:20:00.000Z";
/** Fixed "now" for relative labels — same NY calendar day */
const NOW_NOON_ET = Date.parse("2026-08-28T16:00:00.000Z");
/** US spring-forward morning */
const DST_SPRING = "2026-03-08T15:29:00.000Z";

describe("formatEditionLastUpdated", () => {
  it("KO morning uses a single 오전 from Intl", () => {
    const ko = formatEditionLastUpdated(MORNING_ET, "ko");
    assert.equal(ko, "오전 11:29");
    assert.doesNotMatch(ko, /오전\s*오전/);
  });

  it("KO afternoon uses a single 오후 from Intl", () => {
    const ko = formatEditionLastUpdated(AFTERNOON_ET, "ko");
    assert.equal(ko, "오후 3:20");
    assert.doesNotMatch(ko, /오후\s*오후/);
  });

  it("EN keeps AM/PM without Korean dayPeriod", () => {
    assert.equal(formatEditionLastUpdated(MORNING_ET, "en"), "11:29 AM");
    assert.equal(formatEditionLastUpdated(AFTERNOON_ET, "en"), "3:20 PM");
  });

  it("uses America/New_York across DST spring-forward", () => {
    // 2026-03-08 11:29 EDT after clocks spring forward
    const ko = formatEditionLastUpdated(DST_SPRING, "ko");
    assert.equal(ko, "오전 11:29");
    assert.equal(formatEditionLastUpdated(DST_SPRING, "en"), "11:29 AM");
  });

  it("returns empty string for missing timestamps", () => {
    assert.equal(formatEditionLastUpdated(null, "ko"), "");
    assert.equal(formatEditionLastUpdated("", "en"), "");
  });
});

describe("formatHomeRelativeTime", () => {
  it("KO today / yesterday include a single dayPeriod", () => {
    const today = formatHomeRelativeTime(MORNING_ET, "ko", NOW_NOON_ET);
    assert.equal(today, "오늘 오전 11:29");
    assert.doesNotMatch(today, /오전\s*오전/);

    const yesterdayPub = "2026-08-27T22:40:00.000Z"; // Aug 27 6:40 PM EDT
    const yesterday = formatHomeRelativeTime(
      yesterdayPub,
      "ko",
      NOW_NOON_ET
    );
    assert.match(yesterday, /^어제 오후 /);
    assert.doesNotMatch(yesterday, /오후\s*오후/);
  });

  it("EN today / yesterday keep AM/PM", () => {
    assert.equal(
      formatHomeRelativeTime(MORNING_ET, "en", NOW_NOON_ET),
      "Today 11:29 AM"
    );
  });
});
