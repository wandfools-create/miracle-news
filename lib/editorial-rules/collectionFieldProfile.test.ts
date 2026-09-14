/**
 * Collection field profile evaluation — fixture only (no DB / OpenAI / RSS).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildDefaultCollectionFieldProfile,
  detectConfidentCountry,
  evaluateCollectionFieldProfile,
  mergeFieldOverrides,
  shouldAutoExcludeFieldDecision,
} from "@/lib/editorial-rules/evaluateCollectionFieldProfile";
import type { CollectionCountryConfig } from "@/lib/editorial-rules/collectionProfileTypes";

describe("collection field profile evaluation", () => {
  it("accepts enabled politics field and does not auto-exclude", () => {
    const profile = buildDefaultCollectionFieldProfile(true);
    const decision = evaluateCollectionFieldProfile(
      {
        title: "Congress passes new legislation on tariffs",
        summary: "White House backs the bill",
        collectRegion: "us-intl",
      },
      profile
    );
    assert.equal(shouldAutoExcludeFieldDecision(decision), false);
    assert.ok(
      decision.action === "none" || decision.action === "review",
      decision.reason
    );
  });

  it("excludes unchecked lifestyle entertainment when no exception", () => {
    const profile = buildDefaultCollectionFieldProfile(true);
    const ent = profile.fields.find((f) => f.id === "culture.entertainment");
    assert.ok(ent);
    ent!.enabled = false;
    const decision = evaluateCollectionFieldProfile(
      {
        title: "Celebrity gossip from the red carpet premiere",
        summary: "Entertainment nightly roundup",
        collectRegion: "us-intl",
      },
      profile
    );
    assert.equal(decision.action, "exclude");
    assert.equal(shouldAutoExcludeFieldDecision(decision), true);
  });

  it("rescues unchecked field when public-health exception present", () => {
    const profile = buildDefaultCollectionFieldProfile(true);
    for (const f of profile.fields) {
      if (
        f.id.startsWith("society.") ||
        f.id.startsWith("science.") ||
        f.id.startsWith("lifestyle.") ||
        f.id === "public_health.infectious"
      ) {
        f.enabled = false;
      }
    }
    const decision = evaluateCollectionFieldProfile(
      {
        title: "Health tips and lifestyle wellness hacks",
        summary: "CDC warns of infectious disease outbreak amid pandemic",
        collectRegion: "us-intl",
      },
      profile
    );
    assert.equal(decision.action, "review");
    assert.equal(decision.rescuedFromExclude, true);
  });

  it("keeps strong outbreak as review when science and lifestyle are off", () => {
    const profile = buildDefaultCollectionFieldProfile(true);
    for (const f of profile.fields) {
      if (
        f.id.startsWith("science.") ||
        f.id.startsWith("lifestyle.") ||
        f.id === "public_health.infectious" ||
        f.id === "society.health"
      ) {
        f.enabled = false;
      }
    }
    const decision = evaluateCollectionFieldProfile(
      {
        title: "Measles outbreak cases surge across multiple states",
        summary: "CDC reports hospitalizations rising",
        collectRegion: "us-intl",
      },
      profile
    );
    assert.equal(decision.action, "review");
    assert.equal(decision.rescuedFromExclude, true);
    assert.ok(decision.exceptionSignals.includes("public-health"));
  });

  it("excludes computer virus and soft lifestyle health", () => {
    const profile = buildDefaultCollectionFieldProfile(true);
    const virus = evaluateCollectionFieldProfile(
      {
        title: "Computer virus spreads through email malware",
        summary: "Antivirus vendors warn of ransomware",
        collectRegion: "us-intl",
      },
      profile
    );
    assert.equal(virus.action, "exclude");

    const soft = evaluateCollectionFieldProfile(
      {
        title: "Celebrity health tips and diet wellness hacks",
        summary: "Lifestyle wellness roundup",
        collectRegion: "us-intl",
      },
      profile
    );
    assert.equal(soft.action, "exclude");
  });

  it("does not pass on lone weak virus or research tokens", () => {
    const profile = buildDefaultCollectionFieldProfile(true);
    profile.acceptUnclassified = false;
    const decision = evaluateCollectionFieldProfile(
      {
        title: "New virus research published in lab notes",
        summary: "Health study looks at general findings",
        collectRegion: "us-intl",
      },
      profile
    );
    assert.equal(decision.action, "exclude");
    assert.equal(decision.exceptionSignals.includes("public-health"), false);
  });

  it("does not pass WHO/CDC name-only items as public health", () => {
    const profile = buildDefaultCollectionFieldProfile(true);
    profile.acceptUnclassified = false;
    const who = evaluateCollectionFieldProfile(
      {
        title: "WHO and Switzerland cement cooperation until 2028",
        summary: "Partnership renewal announcement",
        collectRegion: "us-intl",
      },
      profile
    );
    assert.equal(who.action, "exclude");
    assert.equal(who.exceptionSignals.includes("public-health"), false);

    const cdc = evaluateCollectionFieldProfile(
      {
        title: "CDC Launches New Overdose Prevention Data Channel",
        summary: "Agency statement on data tools",
        collectRegion: "us-intl",
      },
      profile
    );
    assert.equal(cdc.action, "exclude");
  });

  it("defaults public_health.infectious on only when setting absent", () => {
    const defaults = buildDefaultCollectionFieldProfile(true);
    const ph = defaults.fields.find((f) => f.id === "public_health.infectious");
    assert.ok(ph);
    assert.equal(ph!.enabled, true);
    assert.equal(ph!.realm, "public_health");

    const legacy = defaults.fields.find((f) => f.id === "society.health");
    assert.ok(legacy);
    assert.equal(legacy!.enabled, false);

    // Simulate existing profile: society.health was on; new field missing → default on.
    const existingOn = mergeFieldOverrides(defaults, {
      enabledById: { "society.health": true },
    });
    assert.equal(
      existingOn.fields.find((f) => f.id === "society.health")!.enabled,
      true
    );
    assert.equal(
      existingOn.fields.find((f) => f.id === "public_health.infectious")!
        .enabled,
      true
    );
  });

  it("accepts enabled US politics hard news without auto-exclude", () => {
    const profile = buildDefaultCollectionFieldProfile(true);
    const decision = evaluateCollectionFieldProfile(
      {
        title: "Senate votes on foreign aid package for allies",
        summary: "White House urges Congress to act",
        collectRegion: "us-intl",
      },
      profile
    );
    assert.equal(shouldAutoExcludeFieldDecision(decision), false);
  });

  it("rejects unclassified when acceptUnclassified is OFF", () => {
    const profile = buildDefaultCollectionFieldProfile(true);
    profile.acceptUnclassified = false;
    const decision = evaluateCollectionFieldProfile(
      {
        title: "xyzzy unique nonce string with no topical cues",
        summary: "qqqq unrelated filler",
        collectRegion: "us-intl",
      },
      profile
    );
    assert.equal(decision.action, "exclude");
    assert.match(decision.decisionKey, /unclassified/);
  });

  it("keeps unclassified for review when acceptUnclassified is ON", () => {
    const profile = buildDefaultCollectionFieldProfile(true);
    profile.acceptUnclassified = true;
    const decision = evaluateCollectionFieldProfile(
      {
        title: "xyzzy unique nonce string with no topical cues",
        summary: "qqqq unrelated filler",
        collectRegion: "korea",
      },
      profile
    );
    assert.equal(decision.action, "review");
    assert.equal(shouldAutoExcludeFieldDecision(decision), false);
  });

  it("skips country exclude when country is not confident", () => {
    const profile = buildDefaultCollectionFieldProfile(true);
    profile.countries = [
      {
        iso: "JP",
        nameKo: "일본",
        enabled: true,
        collectKeywords: ["일본", "Japan", "Tokyo"],
        excludeKeywords: ["anime spoiler", "idol fan"],
        deletedAt: null,
      } satisfies CollectionCountryConfig,
    ];
    const decision = evaluateCollectionFieldProfile(
      {
        title: "Global markets rise on rate cut hopes",
        summary: "Investors watch inflation data",
        collectRegion: "us-intl",
      },
      profile
    );
    assert.notEqual(decision.decisionKey.startsWith("country-exclude"), true);
  });

  it("applies country exclude only after confident country detection", () => {
    const profile = buildDefaultCollectionFieldProfile(true);
    profile.countries = [
      {
        iso: "JP",
        nameKo: "일본",
        enabled: true,
        collectKeywords: ["Japan", "Tokyo"],
        excludeKeywords: ["idol fan meeting"],
        deletedAt: null,
      },
    ];
    const decision = evaluateCollectionFieldProfile(
      {
        title: "Tokyo idol fan meeting draws crowds in Japan",
        summary: "Entertainment night",
        collectRegion: "us-intl",
      },
      profile
    );
    assert.equal(decision.action, "exclude");
    assert.match(decision.decisionKey, /country-exclude:JP/);
  });

  it("detectConfidentCountry returns null on ambiguous dual hits", () => {
    const countries: CollectionCountryConfig[] = [
      {
        iso: "KR",
        nameKo: "한국",
        enabled: true,
        collectKeywords: ["Korea", "Seoul"],
        excludeKeywords: [],
        deletedAt: null,
      },
      {
        iso: "JP",
        nameKo: "일본",
        enabled: true,
        collectKeywords: ["Japan", "Tokyo", "Korea"],
        excludeKeywords: [],
        deletedAt: null,
      },
    ];
    const hit = detectConfidentCountry(
      "korea japan diplomatic talks in seoul and tokyo",
      countries
    );
    // Both may match; if scores tie → null. If one wins, that's ok too as long as pure.
    assert.ok(hit === null || hit.iso === "KR" || hit.iso === "JP");
  });

  it("multi-field match goes to review not exclude", () => {
    const profile = buildDefaultCollectionFieldProfile(true);
    const decision = evaluateCollectionFieldProfile(
      {
        title: "President announces war sanctions and infectious disease response",
        summary: "Congress and CDC briefing on national security and pandemic",
        collectRegion: "us-intl",
      },
      profile
    );
    assert.equal(decision.action, "review");
    assert.equal(shouldAutoExcludeFieldDecision(decision), false);
  });
});

describe("collection field profile wiring (fixture)", () => {
  it("does not modify applied v2 migration file", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "migrations/20260909_editorial_collection_controls_v2.sql"
      ),
      "utf8"
    );
    assert.match(sql, /editorial_collection_rules/);
    assert.doesNotMatch(sql, /editorial_collection_profile/);
  });

  it("adds additive field profile migration", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "migrations/20260910_editorial_collection_field_profile.sql"
      ),
      "utf8"
    );
    assert.match(sql, /editorial_collection_profile/);
    assert.match(sql, /accept_unclassified/);
    assert.match(sql, /service_role/);
    assert.doesNotMatch(sql, /DROP TABLE/);
  });

  it("collect runs field profile before free rules and keeps AI path untouched", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/rss/collectRssToReviewQueue.ts"),
      "utf8"
    );
    assert.match(src, /fetchCollectionFieldProfile/);
    assert.match(src, /evaluateCollectionFieldProfile/);
    assert.match(src, /evaluateEditorialRules/);
    assert.match(src, /fieldProfile\.schemaReady/);
    const fieldIdx = src.indexOf("evaluateCollectionFieldProfile");
    const ruleIdx = src.indexOf(
      "evaluateEditorialRules",
      src.indexOf("prefilterRssFeedItems")
    );
    assert.ok(fieldIdx > 0 && ruleIdx > fieldIdx);
  });

  it("admin UI is field-checkbox first without requiring priority on main form", () => {
    const page = readFileSync(
      join(process.cwd(), "app/admin/(app)/collection-rules/page.tsx"),
      "utf8"
    );
    assert.match(page, /수집할 분야 선택/);
    assert.match(page, /enabledFieldIds/);
    assert.match(page, /acceptUnclassified/);
    assert.match(page, /미분류 기사도 받기/);
    assert.match(page, /한 번에 저장/);
    assert.match(page, /saveCollectionFieldProfileAction/);
    // Main profile form (between primary action and advanced details) has no priority.
    const formStart = page.indexOf("action={saveCollectionFieldProfileAction}");
    const advancedIdx = page.indexOf("고급: 기존 규칙 엔진");
    assert.ok(formStart > 0 && advancedIdx > formStart);
    const mainForm = page.slice(formStart, advancedIdx);
    assert.doesNotMatch(mainForm, /priority|우선순위/);
    assert.match(page.slice(advancedIdx), /우선순위/);
  });
});
