/**
 * Editorial collection rules — fixture only (no DB write / OpenAI / RSS).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { editorialSeedRulesAsCollectionRules } from "@/lib/editorial-rules/defaultSeedRules";
import { evaluateEditorialRules } from "@/lib/editorial-rules/evaluateEditorialRules";
import {
  keywordMatches,
  normalizeEditorialText,
  parseKeywordList,
} from "@/lib/editorial-rules/matchKeywords";
import { previewEditorialRulesOnCandidates } from "@/lib/editorial-rules/previewEditorialRules";
import { validateEditorialRuleInput } from "@/lib/editorial-rules/editorialRuleValidation";
import type { EditorialCollectionRule } from "@/lib/editorial-rules/types";

function rule(
  partial: Partial<EditorialCollectionRule> &
    Pick<EditorialCollectionRule, "id" | "name" | "action">
): EditorialCollectionRule {
  return {
    kind: "keyword",
    keywords: [],
    category: null,
    sourceKey: null,
    region: "all",
    priority: 50,
    isActive: true,
    isSystem: false,
    adminNote: null,
    ...partial,
  };
}

describe("editorial keyword matching", () => {
  it("normalizes unicode and case", () => {
    assert.equal(normalizeEditorialText("  COVID\u00a0Case  "), "covid case");
  });

  it("matches Korean substring with particle-like tails", () => {
    const text = normalizeEditorialText("서울에서 집단감염이 확산했다");
    assert.equal(keywordMatches(text, "집단감염"), true);
  });

  it("matches English word boundaries and basic plurals", () => {
    const text = normalizeEditorialText("Hospitals report surge in hospitalizations");
    assert.equal(keywordMatches(text, "hospitalization"), true);
    assert.equal(keywordMatches(text, "tar"), false);
  });

  it("parses keyword lists without duplicates", () => {
    assert.deepEqual(parseKeywordList("COVID, covid\noutbreak"), ["COVID", "outbreak"]);
  });
});

describe("editorial rule evaluation", () => {
  it("prioritizes public-health seed over soft science exclude", () => {
    const rules = editorialSeedRulesAsCollectionRules(true);
    const decision = evaluateEditorialRules(
      {
        title: "New COVID variant drives hospitalization surge",
        summary: "CDC monitors infectious disease outbreak",
        sourceKey: "ap",
        collectRegion: "us-intl",
      },
      rules
    );
    assert.equal(decision.action, "prioritize");
    assert.match(decision.ruleName ?? "", /공중보건/);
  });

  it("excludes ScienceDaily source seed", () => {
    const rules = editorialSeedRulesAsCollectionRules(true);
    const decision = evaluateEditorialRules(
      {
        title: "Curious space selfie from a telescope",
        sourceKey: "sciencedaily",
        collectRegion: "us-intl",
      },
      rules
    );
    assert.equal(decision.action, "exclude");
    assert.equal(decision.ruleId, "a1000001-0001-4000-8000-000000000010");
  });

  it("rescues exclude when important exception signals present", () => {
    const rules = [
      rule({
        id: "e1",
        name: "생활 제외",
        action: "exclude",
        keywords: ["건강 상식"],
        priority: 40,
      }),
    ];
    const decision = evaluateEditorialRules(
      {
        title: "건강 상식: 코로나 확진자 급증에 공중보건 비상사태",
        sourceKey: "chosun",
        collectRegion: "korea",
      },
      rules
    );
    assert.equal(decision.action, "review");
    assert.equal(decision.rescuedFromExclude, true);
    assert.ok(decision.exceptionSignals.includes("public-health"));
  });

  it("honors always_keep over exclude", () => {
    const rules = [
      rule({
        id: "k1",
        name: "항상 유지",
        action: "always_keep",
        keywords: ["무역"],
        priority: 10,
      }),
      rule({
        id: "x1",
        name: "제외",
        action: "exclude",
        keywords: ["무역"],
        priority: 99,
      }),
    ];
    const decision = evaluateEditorialRules(
      { title: "한미 무역 협상", sourceKey: "yonhap" },
      rules
    );
    assert.equal(decision.action, "always_keep");
  });

  it("ignores inactive rules and region mismatch", () => {
    const rules = [
      rule({
        id: "off",
        name: "비활성",
        action: "exclude",
        keywords: ["운세"],
        isActive: false,
      }),
      rule({
        id: "kr-only",
        name: "한국만 제외",
        action: "exclude",
        keywords: ["운세"],
        region: "korea",
        priority: 80,
      }),
    ];
    const us = evaluateEditorialRules(
      {
        title: "오늘의 운세",
        sourceKey: "fox-news",
        collectRegion: "us-intl",
      },
      rules
    );
    assert.equal(us.action, "none");

    const kr = evaluateEditorialRules(
      {
        title: "오늘의 운세",
        sourceKey: "chosun",
        collectRegion: "korea",
      },
      rules
    );
    assert.equal(kr.action, "exclude");
  });

  it("skips a single throwing rule without aborting", () => {
    const bad = rule({
      id: "bad",
      name: "bad",
      action: "exclude",
      keywords: ["x"],
    });
    Object.defineProperty(bad, "keywords", {
      get() {
        throw new Error("boom");
      },
    });
    const rules = [
      bad,
      rule({
        id: "ok",
        name: "ok exclude",
        action: "exclude",
        keywords: ["horoscope"],
        priority: 20,
      }),
    ];
    const decision = evaluateEditorialRules(
      { title: "Daily horoscope guide", sourceKey: "csm" },
      rules
    );
    assert.equal(decision.action, "exclude");
    assert.equal(decision.ruleId, "ok");
  });
});

describe("editorial preview and validation", () => {
  it("preview is read-only aggregation", () => {
    const rules = editorialSeedRulesAsCollectionRules(true);
    const summary = previewEditorialRulesOnCandidates(
      [
        {
          id: "1",
          title: "COVID outbreak spreads",
          sourceKey: "ap",
          collectRegion: "us-intl",
        },
        {
          id: "2",
          title: "Community calendar of local events",
          sourceKey: "fox-news",
          collectRegion: "us-intl",
        },
        {
          id: "3",
          title: "Science curiosity dig",
          sourceKey: "sciencedaily",
          collectRegion: "us-intl",
        },
      ],
      rules
    );
    assert.equal(summary.scanned, 3);
    assert.ok(summary.byAction.prioritize >= 1);
    assert.ok(summary.byAction.exclude >= 1);
    assert.equal(summary.items.length, 3);
  });

  it("requires confirmation for source-wide exclude", () => {
    const result = validateEditorialRuleInput(
      {
        name: "SD exclude",
        kind: "source",
        action: "exclude",
        keywordsRaw: "",
        category: null,
        sourceKey: "sciencedaily",
        region: "us-intl",
        priority: 50,
        isActive: false,
        adminNote: null,
        confirmSourceWideExclude: false,
      },
      []
    );
    assert.equal(result.ok, false);
  });

  it("rejects duplicate rule names", () => {
    const result = validateEditorialRuleInput(
      {
        name: "기본 제외: ScienceDaily 출처",
        kind: "keyword",
        action: "review",
        keywordsRaw: "test",
        category: null,
        sourceKey: null,
        region: "all",
        priority: 10,
        isActive: false,
        adminNote: null,
      },
      editorialSeedRulesAsCollectionRules(true)
    );
    assert.equal(result.ok, false);
  });
});

describe("editorial rules wiring (fixture)", () => {
  it("migration is additive with RLS and cleanup function", () => {
    const sql = readFileSync(
      join(process.cwd(), "migrations/20260909_editorial_collection_controls_v2.sql"),
      "utf8"
    );
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.editorial_collection_rules/);
    assert.match(sql, /editorial_collection_audit/);
    assert.match(sql, /REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /cleanup_editorial_collection_audit/);
    assert.doesNotMatch(sql, /TRUNCATE|DELETE FROM public\.collection_candidates/i);
    assert.match(sql, /sciencedaily/);
  });

  it("collect prefilter loads rules fail-open and records audit before exclude", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/rss/collectRssToReviewQueue.ts"),
      "utf8"
    );
    assert.match(src, /fetchEditorialCollectionRules/);
    assert.match(src, /evaluateEditorialRules/);
    assert.match(src, /recordEditorialExclusion/);
    assert.match(src, /shouldAutoExcludeEditorialDecision/);
  });

  it("admin page exists for collection-rules", () => {
    const page = readFileSync(
      join(process.cwd(), "app/admin/(app)/collection-rules/page.tsx"),
      "utf8"
    );
    assert.match(page, /수집 기준/);
    assert.match(page, /미리보기/);
    assert.doesNotMatch(page, /OpenAI/);
  });
});
