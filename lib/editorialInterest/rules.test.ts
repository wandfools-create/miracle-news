import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInterestRulesPromptSection,
  matchEditorialInterestRules,
  DEFAULT_EDITORIAL_INTEREST_RULES,
} from "@/lib/editorialInterest/rules";

describe("editorialInterest rules", () => {
  it("matches keywords deterministically", () => {
    const matches = matchEditorialInterestRules(
      {
        title: "Fed signals interest rate path",
        summary: "Federal Reserve officials discussed inflation.",
        sourceCountry: "US",
      },
      DEFAULT_EDITORIAL_INTEREST_RULES
    );
    assert.ok(matches.length >= 1);
    assert.match(matches[0]!.ruleName, /미국/);
  });

  it("builds prompt section for active rules", () => {
    const section = buildInterestRulesPromptSection(DEFAULT_EDITORIAL_INTEREST_RULES);
    assert.match(section, /editorial interest rules/i);
    assert.match(section, /미국 정치/);
  });
});
