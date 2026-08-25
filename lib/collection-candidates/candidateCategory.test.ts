import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyCandidateCategory,
  parseCandidateCategoryFilter,
} from "./candidateCategory";

describe("candidateCategory (rule-based, no OpenAI)", () => {
  it("maps politics / economy / science keywords", () => {
    assert.equal(
      classifyCandidateCategory({
        source: "ap",
        rssTitle: "Trump signs new election bill in Congress",
        rssSummary: null,
      }),
      "politics"
    );
    assert.equal(
      classifyCandidateCategory({
        source: "fox-news",
        rssTitle: "Fed holds interest rate as inflation cools",
        rssSummary: "Markets rose after the announcement",
      }),
      "economy"
    );
    assert.equal(
      classifyCandidateCategory({
        source: "bbc",
        rssTitle: "NASA telescope finds new exoplanet",
        rssSummary: "Researchers published the study",
      }),
      "science_tech"
    );
  });

  it("uses source hint when text is weak", () => {
    assert.equal(
      classifyCandidateCategory({
        source: "sciencedaily",
        rssTitle: "Weekly roundup",
        rssSummary: "Assorted notes",
      }),
      "science_tech"
    );
    assert.equal(
      classifyCandidateCategory({
        source: "bbc",
        rssTitle: "Weekly roundup",
        rssSummary: "Assorted notes",
      }),
      "world"
    );
  });

  it("falls back to other when ambiguous", () => {
    assert.equal(
      classifyCandidateCategory({
        source: "csm",
        rssTitle: "A quiet afternoon walk",
        rssSummary: "Nothing particular happened",
      }),
      "other"
    );
  });

  it("prefers stored feed category over title inference", () => {
    assert.equal(
      classifyCandidateCategory({
        source: "chosun",
        rssTitle: "Weekly roundup",
        rssSummary: "Assorted notes",
        category: "politics",
      }),
      "politics"
    );
    assert.equal(
      classifyCandidateCategory({
        source: "tvchosun",
        rssTitle: "Fed holds interest rate",
        category: "society",
      }),
      "society"
    );
  });

  it("parses category filter keys", () => {
    assert.equal(parseCandidateCategoryFilter("politics"), "politics");
    assert.equal(parseCandidateCategoryFilter("nope"), "all");
    assert.equal(parseCandidateCategoryFilter(undefined), "all");
  });
});
