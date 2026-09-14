import type { CollectRegion } from "@/lib/rss/collectRegions";

import type {
  CollectionCountryConfig,
  CollectionFieldConfig,
  CollectionFieldDecision,
  CollectionFieldProfile,
  FieldMatchHit,
} from "@/lib/editorial-rules/collectionProfileTypes";
import { detectEditorialExceptionSignals } from "@/lib/editorial-rules/exceptionSignals";
import {
  BUILT_IN_COLLECTION_FIELDS,
  type CollectionRegionScope,
  getBuiltInFieldById,
} from "@/lib/editorial-rules/fieldTaxonomy";
import {
  keywordMatches,
  normalizeEditorialText,
} from "@/lib/editorial-rules/matchKeywords";
import {
  detectStrongPublicHealthSignal,
  isScienceOrLifestyleFieldId,
  isSoftPublicHealthNoise,
} from "@/lib/editorial-rules/publicHealthSignals";

function scopeApplies(
  scope: CollectionRegionScope,
  collectRegion: CollectRegion | null | undefined
): boolean {
  if (scope === "all") return true;
  if (!collectRegion) return true;
  if (scope === "korea") return collectRegion === "korea";
  if (scope === "us" || scope === "intl") return collectRegion === "us-intl";
  return true;
}

function matchKeywordsInText(
  text: string,
  keywords: string[]
): string[] {
  return keywords.filter((k) => keywordMatches(text, k));
}

/**
 * Country is "confident" only when ≥1 collect keyword hits.
 * Otherwise country exclude rules must not apply.
 */
export function detectConfidentCountry(
  text: string,
  countries: CollectionCountryConfig[]
): CollectionCountryConfig | null {
  const hits: Array<{ country: CollectionCountryConfig; score: number }> = [];
  for (const country of countries) {
    if (!country.enabled || country.deletedAt) continue;
    const matched = matchKeywordsInText(text, country.collectKeywords);
    if (matched.length === 0) continue;
    hits.push({ country, score: matched.length });
  }
  if (hits.length === 0) return null;
  hits.sort(
    (a, b) =>
      b.score - a.score || a.country.iso.localeCompare(b.country.iso)
  );
  // Ambiguous top scores → treat as uncertain.
  if (hits.length >= 2 && hits[0]!.score === hits[1]!.score) return null;
  return hits[0]!.country;
}

function fieldHits(
  text: string,
  fields: CollectionFieldConfig[]
): FieldMatchHit[] {
  const hits: FieldMatchHit[] = [];
  for (const field of fields) {
    if (field.deletedAt) continue;
    const matchedCollect = matchKeywordsInText(text, field.collectKeywords);
    const matchedExclude = matchKeywordsInText(text, field.excludeKeywords);
    if (matchedCollect.length === 0 && matchedExclude.length === 0) continue;
    hits.push({
      fieldId: field.id,
      labelKo: field.labelKo,
      enabled: field.enabled,
      matchedCollect,
      matchedExclude,
    });
  }
  return hits;
}

/**
 * Field/country allowlist evaluation for pre-AI intake.
 * Does not change AI importance scores.
 */
export function evaluateCollectionFieldProfile(
  input: {
    title: string;
    summary?: string | null;
    categories?: string[];
    collectRegion?: CollectRegion | null;
  },
  profile: CollectionFieldProfile
): CollectionFieldDecision {
  const text = normalizeEditorialText(
    [input.title, input.summary ?? "", ...(input.categories ?? [])].join(" ")
  );
  const exceptionSignals = detectEditorialExceptionSignals(text);

  if (!scopeApplies(profile.regionScope, input.collectRegion)) {
    return {
      action: "exclude",
      reason: `지역 범위(${profile.regionScope}) 밖 수집분`,
      decisionKey: `scope:${profile.regionScope}`,
      matchedFields: [],
      exceptionSignals,
      rescuedFromExclude: false,
      countrySkippedUncertain: false,
      lowConfidence: false,
    };
  }

  const activeFields = profile.fields.filter((f) => !f.deletedAt);
  const hits = fieldHits(text, activeFields);

  let countrySkippedUncertain = false;
  const country = detectConfidentCountry(text, profile.countries);
  if (!country) {
    countrySkippedUncertain = profile.countries.some(
      (c) => c.enabled && !c.deletedAt && c.excludeKeywords.length > 0
    );
  } else {
    const countryExcludeHits = matchKeywordsInText(
      text,
      country.excludeKeywords
    );
    if (countryExcludeHits.length > 0) {
      if (exceptionSignals.length > 0) {
        return {
          action: "review",
          reason: `국가(${country.iso}) 제외 키워드와 중요 예외 신호가 함께 감지됨`,
          decisionKey: `country-exclude:${country.iso}`,
          matchedFields: hits,
          exceptionSignals,
          rescuedFromExclude: true,
          countrySkippedUncertain: false,
          lowConfidence: false,
        };
      }
      return {
        action: "exclude",
        reason: `국가(${country.iso}) 제외: ${countryExcludeHits.slice(0, 3).join(", ")}`,
        decisionKey: `country-exclude:${country.iso}`,
        matchedFields: hits,
        exceptionSignals,
        rescuedFromExclude: false,
        countrySkippedUncertain: false,
        lowConfidence: false,
      };
    }
  }

  // Explicit exclude-keyword hits on a field (even if field enabled).
  const hardExclude = hits.find((h) => h.matchedExclude.length > 0);
  if (hardExclude) {
    if (exceptionSignals.length > 0) {
      return {
        action: "review",
        reason: `분야 제외 키워드와 중요 예외 신호: ${hardExclude.labelKo}`,
        decisionKey: `field-exclude-kw:${hardExclude.fieldId}`,
        matchedFields: hits,
        exceptionSignals,
        rescuedFromExclude: true,
        countrySkippedUncertain,
        lowConfidence: false,
      };
    }
    return {
      action: "exclude",
      reason: `분야 제외 키워드(${hardExclude.labelKo}): ${hardExclude.matchedExclude.slice(0, 3).join(", ")}`,
      decisionKey: `field-exclude-kw:${hardExclude.fieldId}`,
      matchedFields: hits,
      exceptionSignals,
      rescuedFromExclude: false,
      countrySkippedUncertain,
      lowConfidence: false,
    };
  }

  const collectHits = hits.filter((h) => h.matchedCollect.length > 0);
  const enabledCollect = collectHits.filter((h) => h.enabled);
  const disabledCollect = collectHits.filter((h) => !h.enabled);
  const strongPublicHealth = detectStrongPublicHealthSignal(text);
  const softHealthNoise = isSoftPublicHealthNoise(text);

  // Soft lifestyle / celebrity / computer-virus noise never enters via PH keywords alone.
  if (softHealthNoise && !strongPublicHealth) {
    const onlySoftHealthFields =
      collectHits.length > 0 &&
      collectHits.every(
        (h) =>
          h.fieldId === "public_health.infectious" ||
          h.fieldId === "society.health" ||
          isScienceOrLifestyleFieldId(h.fieldId)
      );
    if (onlySoftHealthFields || collectHits.length === 0) {
      return {
        action: "exclude",
        reason: "생활 건강·연예 건강·컴퓨터 바이러스 등 연성 건강 신호 제외",
        decisionKey: "soft-public-health-noise",
        matchedFields: hits,
        exceptionSignals,
        rescuedFromExclude: false,
        countrySkippedUncertain,
        lowConfidence: false,
      };
    }
  }

  // Multi-field or low-confidence → never auto-exclude (unless all soft desks disabled).
  const lowConfidence =
    collectHits.length === 1 &&
    collectHits[0]!.matchedCollect.length === 1 &&
    collectHits[0]!.matchedCollect[0]!.trim().length <= 2;

  if (collectHits.length >= 2 || lowConfidence) {
    const allDisabled =
      collectHits.length >= 1 &&
      collectHits.every((h) => !h.enabled) &&
      enabledCollect.length === 0;
    const allDisabledScienceLifestyle =
      collectHits.length >= 2 &&
      collectHits.every(
        (h) => !h.enabled && isScienceOrLifestyleFieldId(h.fieldId)
      );

    // Strong infectious signals beat disabled science/lifestyle/PH field checkboxes.
    if (allDisabled && strongPublicHealth) {
      return {
        action: "review",
        reason:
          "분야 체크 해제 상태이나 강한 공중보건·감염병 신호로 일반 검토 후보",
        decisionKey: "public-health-strong-signal",
        matchedFields: hits,
        exceptionSignals,
        rescuedFromExclude: true,
        countrySkippedUncertain,
        lowConfidence: false,
      };
    }

    if (allDisabledScienceLifestyle && !strongPublicHealth) {
      if (exceptionSignals.length > 0) {
        return {
          action: "review",
          reason: `과학·생활 해제이나 중요 예외 신호로 일반 검토`,
          decisionKey: "science-lifestyle-disabled-exception",
          matchedFields: hits,
          exceptionSignals,
          rescuedFromExclude: true,
          countrySkippedUncertain,
          lowConfidence: false,
        };
      }
      return {
        action: "exclude",
        reason: `체크 해제 과학·생활 분야: ${collectHits
          .map((h) => h.labelKo)
          .slice(0, 4)
          .join(", ")}`,
        decisionKey: "science-lifestyle-disabled",
        matchedFields: hits,
        exceptionSignals,
        rescuedFromExclude: false,
        countrySkippedUncertain,
        lowConfidence: false,
      };
    }
    return {
      action: "review",
      reason:
        collectHits.length >= 2
          ? `여러 분야 동시 일치: ${collectHits.map((h) => h.labelKo).slice(0, 4).join(", ")}`
          : `분류 신뢰도 낮음: ${collectHits[0]?.labelKo ?? "미상"}`,
      decisionKey: "ambiguous-or-low-confidence",
      matchedFields: hits,
      exceptionSignals,
      rescuedFromExclude: false,
      countrySkippedUncertain,
      lowConfidence: true,
    };
  }

  if (disabledCollect.length === 1 && enabledCollect.length === 0) {
    const disabled = disabledCollect[0]!;
    if (strongPublicHealth) {
      return {
        action: "review",
        reason:
          "분야 체크 해제 상태이나 강한 공중보건·감염병 신호로 일반 검토 후보",
        decisionKey: "public-health-strong-signal",
        matchedFields: hits,
        exceptionSignals,
        rescuedFromExclude: true,
        countrySkippedUncertain,
        lowConfidence: false,
      };
    }
    if (exceptionSignals.length > 0) {
      return {
        action: "review",
        reason: `체크 해제 분야(${disabled.labelKo})이나 중요 예외 신호로 일반 검토`,
        decisionKey: `field-disabled:${disabled.fieldId}`,
        matchedFields: hits,
        exceptionSignals,
        rescuedFromExclude: true,
        countrySkippedUncertain,
        lowConfidence: false,
      };
    }
    return {
      action: "exclude",
      reason: `체크 해제 분야: ${disabled.labelKo}`,
      decisionKey: `field-disabled:${disabled.fieldId}`,
      matchedFields: hits,
      exceptionSignals,
      rescuedFromExclude: false,
      countrySkippedUncertain,
      lowConfidence: false,
    };
  }

  if (enabledCollect.length === 1) {
    return {
      action: "none",
      reason: `수집 분야 일치: ${enabledCollect[0]!.labelKo}`,
      decisionKey: `field-allow:${enabledCollect[0]!.fieldId}`,
      matchedFields: hits,
      exceptionSignals,
      rescuedFromExclude: false,
      countrySkippedUncertain,
      lowConfidence: false,
    };
  }

  // Unclassified
  if (profile.acceptUnclassified) {
    return {
      action: "review",
      reason: "미분류 · 미분류 기사 받기로 일반 검토",
      decisionKey: "unclassified-accept",
      matchedFields: hits,
      exceptionSignals,
      rescuedFromExclude: false,
      countrySkippedUncertain,
      lowConfidence: true,
    };
  }

  if (exceptionSignals.length > 0) {
    return {
      action: "review",
      reason: "미분류이나 중요 예외 신호로 일반 검토",
      decisionKey: "unclassified-exception",
      matchedFields: hits,
      exceptionSignals,
      rescuedFromExclude: true,
      countrySkippedUncertain,
      lowConfidence: true,
    };
  }

  return {
    action: "exclude",
    reason: "미분류 기사 (미분류 받기 OFF)",
    decisionKey: "unclassified-reject",
    matchedFields: hits,
    exceptionSignals,
    rescuedFromExclude: false,
    countrySkippedUncertain,
    lowConfidence: true,
  };
}

export function shouldAutoExcludeFieldDecision(
  decision: CollectionFieldDecision
): boolean {
  return decision.action === "exclude";
}

/** Code defaults when DB profile missing or empty. */
export function buildDefaultCollectionFieldProfile(
  schemaReady: boolean
): CollectionFieldProfile {
  return {
    acceptUnclassified: false,
    regionScope: "all",
    fields: BUILT_IN_COLLECTION_FIELDS.map((f) => ({
      id: f.id,
      realm: f.realm,
      labelKo: f.labelKo,
      enabled: f.defaultEnabled,
      isCustom: false,
      collectKeywords: [...f.collectKeywords],
      excludeKeywords: [...f.excludeKeywords],
      deletedAt: null,
    })),
    countries: [],
    updatedAt: null,
    updatedBy: null,
    schemaReady,
  };
}

export function mergeFieldOverrides(
  base: CollectionFieldProfile,
  overrides: {
    acceptUnclassified?: boolean;
    regionScope?: CollectionRegionScope;
    enabledById?: Record<string, boolean>;
    keywordOverrides?: Record<
      string,
      { collectKeywords?: string[]; excludeKeywords?: string[] }
    >;
    customFields?: CollectionFieldConfig[];
    countries?: CollectionCountryConfig[];
  }
): CollectionFieldProfile {
  const fields = base.fields.map((f) => {
    const builtIn = getBuiltInFieldById(f.id);
    const kw = overrides.keywordOverrides?.[f.id];
    return {
      ...f,
      enabled:
        overrides.enabledById && f.id in overrides.enabledById
          ? Boolean(overrides.enabledById[f.id])
          : f.enabled,
      collectKeywords: kw?.collectKeywords ?? f.collectKeywords,
      excludeKeywords: kw?.excludeKeywords ?? f.excludeKeywords,
      labelKo: builtIn?.labelKo ?? f.labelKo,
      realm: builtIn?.realm ?? f.realm,
    };
  });

  const existingIds = new Set(fields.map((f) => f.id));
  for (const custom of overrides.customFields ?? []) {
    if (existingIds.has(custom.id)) continue;
    fields.push(custom);
  }

  return {
    ...base,
    acceptUnclassified:
      overrides.acceptUnclassified ?? base.acceptUnclassified,
    regionScope: overrides.regionScope ?? base.regionScope,
    fields,
    countries: overrides.countries ?? base.countries,
  };
}
