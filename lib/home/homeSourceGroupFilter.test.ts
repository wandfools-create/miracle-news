import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  englishLabelForSourceKey,
  localizeSourceLabel,
} from "@/lib/article/sourceDisplayLabels";
import {
  displaySourceTabLabel,
  featuredConfigsForGroup,
  filterSourceLeadCardsByGroup,
  HOME_SOURCE_GROUP_FOREIGN_KEYS,
  HOME_SOURCE_GROUP_KOREAN_KEYS,
  homeSourceGroupButtonLabels,
  homeSectionTabClass,
  sourceKeyInHomeGroup,
} from "./homeSourceGroupFilter";
import type { SourceLeadCard } from "./types";

function lead(key: string, label: string): SourceLeadCard {
  return {
    key,
    label,
    description: "",
    article: {
      id: key,
      title: "t",
      summary: null,
      slug: key,
      created_at: "2026-01-01T00:00:00.000Z",
      source: key,
      category: "politics",
      published_at: "2026-01-01T00:00:00.000Z",
      thumbnail_url: null,
      title_original: "t",
    },
  };
}

describe("homeSourceGroupFilter", () => {
  it("maps foreign and korean keys from featured configs only", () => {
    assert.deepEqual(HOME_SOURCE_GROUP_FOREIGN_KEYS, [
      "ap",
      "pbs-newshour",
      "fox-news",
      "cnn",
      "csm",
      "bbc",
      "sciencedaily",
    ]);
    assert.deepEqual(HOME_SOURCE_GROUP_KOREAN_KEYS, [
      "chosun",
      "joongang",
      "tvchosun",
      "insight",
      "yonhap",
      "korea-herald",
    ]);
    assert.equal(sourceKeyInHomeGroup("yonhap-kr-radar", "all"), true);
    assert.equal(sourceKeyInHomeGroup("yonhap-kr-radar", "foreign"), false);
    assert.equal(sourceKeyInHomeGroup("reuters", "korean"), false);
  });

  it("filters tabs and cards by group without URL query", () => {
    const cards = [
      lead("ap", "AP"),
      lead("chosun", "조선일보"),
      lead("bbc", "BBC World"),
    ];
    const foreignOnly = filterSourceLeadCardsByGroup(cards, "foreign", null);
    assert.equal(foreignOnly.length, 2);
    assert.ok(foreignOnly.every((c) => sourceKeyInHomeGroup(c.key, "foreign")));

    const koreanChosun = filterSourceLeadCardsByGroup(cards, "korean", "chosun");
    assert.equal(koreanChosun.length, 1);
    assert.equal(koreanChosun[0]?.key, "chosun");
  });

  it("featuredConfigsForGroup excludes auxiliary outlets", () => {
    const foreign = featuredConfigsForGroup("foreign");
    const korean = featuredConfigsForGroup("korean");
    assert.ok(foreign.every((c) => sourceKeyInHomeGroup(c.key, "foreign")));
    assert.ok(korean.every((c) => sourceKeyInHomeGroup(c.key, "korean")));
    assert.ok(
      !foreign.some((c) => c.key === "yonhap-kr-radar" || c.key === "reuters")
    );
  });

  it("shows English outlet names on EN locale via sourceDisplayLabels", () => {
    assert.equal(englishLabelForSourceKey("chosun"), "Chosun Ilbo");
    assert.equal(englishLabelForSourceKey("joongang"), "JoongAng Ilbo");
    assert.equal(englishLabelForSourceKey("tvchosun"), "TV Chosun");
    assert.equal(englishLabelForSourceKey("insight"), "Insight");
    assert.equal(englishLabelForSourceKey("yonhap"), "Yonhap News Agency");
    assert.equal(englishLabelForSourceKey("korea-herald"), "The Korea Herald");

    assert.equal(
      displaySourceTabLabel({ key: "chosun", label: "조선일보" }, "en"),
      "Chosun Ilbo"
    );
    assert.equal(
      displaySourceTabLabel({ key: "chosun", label: "조선일보" }, "ko"),
      "조선일보"
    );
    assert.equal(
      localizeSourceLabel("조선일보", "en", "chosun"),
      "Chosun Ilbo"
    );
  });

  it("group button labels are localized", () => {
    assert.equal(homeSourceGroupButtonLabels("ko").foreign, "미국·국제");
    assert.equal(
      homeSourceGroupButtonLabels("en").foreign,
      "U.S. & International"
    );
    assert.equal(homeSourceGroupButtonLabels("en").korean, "Korean Outlets");
  });

  it("tab class includes pointer, hover, and focus-visible affordances", () => {
    assert.match(homeSectionTabClass(true), /cursor-pointer/);
    assert.match(homeSectionTabClass(false), /hover:bg-neutral-100/);
    assert.match(homeSectionTabClass(false), /focus-visible:outline/);
    assert.match(homeSectionTabClass(false, false), /cursor-not-allowed/);
  });

  it("HomeNewsView wires local source group without URL query", () => {
    const view = readFileSync(
      join(process.cwd(), "components/home/HomeNewsView.tsx"),
      "utf8"
    );
    assert.match(view, /localSourceGroup/);
    assert.match(view, /featuredConfigsForGroup/);
    assert.match(view, /homeSectionTabClass/);
    assert.match(view, /displaySourceTabLabel/);
    assert.doesNotMatch(view, /set\("source"/);
  });
});
