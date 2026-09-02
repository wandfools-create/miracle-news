import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  centerBandGridColClass,
  centerBandGridRowClass,
  homeFeaturedCenterColClass,
  homeLeftRailColClass,
  homeRightRailColClass,
  isGlobalHomeFilterMode,
  shouldShowLatestFallbackSection,
  shouldShowTopStoriesBand,
  shouldUseNewspaperThreeColGrid,
} from "./homeCenterLayoutPolicy";

describe("homeCenterLayoutPolicy", () => {
  it("hides topStories band during carryover or featured combo layout", () => {
    assert.equal(
      shouldShowTopStoriesBand({
        showTopStories: true,
        isCarryover: true,
        useFeaturedComboLayout: false,
      }),
      false
    );
    assert.equal(
      shouldShowTopStoriesBand({
        showTopStories: true,
        isCarryover: false,
        useFeaturedComboLayout: true,
      }),
      false
    );
    assert.equal(
      shouldShowTopStoriesBand({
        showTopStories: true,
        isCarryover: false,
        useFeaturedComboLayout: false,
      }),
      true
    );
  });

  it("does not duplicate latest fallback when featured combo already shows related", () => {
    assert.equal(
      shouldShowLatestFallbackSection({
        showTopStoriesBand: false,
        useFeaturedComboLayout: true,
        latestCount: 0,
      }),
      false
    );
    assert.equal(
      shouldShowLatestFallbackSection({
        showTopStoriesBand: false,
        useFeaturedComboLayout: true,
        latestCount: 3,
      }),
      false
    );
    assert.equal(
      shouldShowLatestFallbackSection({
        showTopStoriesBand: false,
        useFeaturedComboLayout: false,
        latestCount: 2,
      }),
      true
    );
  });

  it("places secondary center bands on row 3 when featured block is visible", () => {
    assert.equal(centerBandGridRowClass(true), "xl:row-start-3");
    assert.equal(centerBandGridRowClass(false), "xl:row-start-2");
  });

  it("activates global filter mode only from URL query params", () => {
    assert.equal(
      isGlobalHomeFilterMode({ sourceFromUrl: "chosun", categoryFromUrl: null }),
      true
    );
    assert.equal(
      isGlobalHomeFilterMode({ sourceFromUrl: null, categoryFromUrl: "politics" }),
      true
    );
    assert.equal(
      isGlobalHomeFilterMode({ sourceFromUrl: null, categoryFromUrl: null }),
      false
    );
  });

  it("always uses newspaper 3-col grid when edition home is visible", () => {
    assert.equal(shouldUseNewspaperThreeColGrid({ showEditionHome: true }), true);
    assert.equal(shouldUseNewspaperThreeColGrid({ showEditionHome: false }), false);
  });

  it("pins center and rails to fixed grid columns on desktop", () => {
    assert.equal(homeLeftRailColClass(), "xl:col-start-1");
    assert.equal(homeFeaturedCenterColClass(), "xl:col-start-2");
    assert.equal(homeRightRailColClass(), "xl:col-start-3");
    assert.equal(centerBandGridColClass(), "xl:col-span-2 xl:col-start-1");
  });

  it("HomeNewsView keeps bottom tabs local and URL params global-only", () => {
    const view = readFileSync(
      join(process.cwd(), "components/home/HomeNewsView.tsx"),
      "utf8"
    );
    assert.match(view, /localSourceTabKey/);
    assert.match(view, /localSourceGroup/);
    assert.match(view, /localCategoryTab/);
    assert.match(view, /setLocalSourceTabKey/);
    assert.match(view, /selectLocalCategory/);
    assert.match(view, /isGlobalHomeFilterMode/);
    assert.match(view, /shouldUseNewspaperThreeColGrid/);
    assert.match(view, /homeLeftRailColClass/);
    assert.match(view, /homeFeaturedCenterColClass/);
    assert.match(view, /homeRightRailColClass/);
    assert.doesNotMatch(view, /newsHomeRightOnlyGrid/);
    assert.doesNotMatch(view, /newsHomeLeftOnlyGrid/);
    assert.match(view, /shouldShowLatestFallbackSection/);
    assert.doesNotMatch(view, /onClick=\{\(\) => selectSource\(/);
    assert.doesNotMatch(view, /onClick=\{\(\) => selectCategory\(/);
  });
});

describe("carryover layout regression", () => {
  it("uses centerBandRowClass instead of hard-coded duplicate latest row at row-start-2", () => {
    const view = readFileSync(
      join(process.cwd(), "components/home/HomeNewsView.tsx"),
      "utf8"
    );
    assert.match(view, /centerBandRowClass/);
    assert.match(view, /showLatestFallbackSection/);
    assert.match(view, /showTopStoriesBand/);
    assert.doesNotMatch(
      view,
      /useFeaturedComboLayout && \(featuredHub\.related/
    );
  });
});
